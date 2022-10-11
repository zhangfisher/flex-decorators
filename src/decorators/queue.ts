/**
 * 
 * 排队调用被装饰的方法
 * 
 * 
 

 */
import { createDecorator, DecoratorContext, DecoratorMethodContext } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AllowNull, AsyncFunction } from "../types"
import {DecoratorManager,  DecoratorManagerOptions,  IDecoratorManagerHook } from "../manager"
import { asyncSignal,IAsyncSignal } from "../asyncSignal"
import { applyParams, delay,  isFunction } from "../utils"
import timeoutWrapper from "../wrappers/timeout"
import { LiteEventEmitter } from "../LiteEventEmitter"

export type QueueFailureBehaviour  = "ignore" | "retry" | "requeue"
export type QueueOverflowOptions = 'discard' | 'overlap' | 'slide' 

export interface QueueOptions extends DecoratorOptions {
    id?           : string
    length?       : number   
    overflow?     : QueueOverflowOptions                            // 队列溢出时的处理方式,discard=丢弃,overlap=覆盖最后一条,slide=挤出最早一条
    priority?     : AllowNull<(tasks:QueueTask[])=>QueueTask[]>     // 优先级
    failure?      : QueueFailureBehaviour                           // 执行出错时的行为，ignore=什么都不做,retry=重试,requeue=重新排队，但是受retryCount限制
    retryCount?   : number
    retryInterval?: number
    timeout?      : number
    default?      : any                                             // 如果提供则返回该默认值而不是触发错误
    objectify?    : boolean                                          // 执行方法后是否返回一个QueueTask对象
    maxQueueTime? : number                                          // 最大的排队时间，超出时会自动丢弃
    onDiscard?    : Function                                        // 当任务被抛弃时的回调
}

export interface IQueueDecoratorOptionsReader {
    getQueueDecoratorOptions(options:QueueOptions,methodName:string | symbol,decoratorName:string):QueueOptions
}

export enum QueueTaskStatus{
    Queuing=0,                              // 正在排队等待执行
    Cancelled=1,
    Executing=2,                            // 正在执行
    Done=3                                 // 已执行完成
}


export class QueueTask{
    static seq :number = 0;
    id              : number=0                              // 任务id
    #inqueueTime     : number                               // 任务开始排队的时间
    runCount        : number=0                              // 执行次数，当出错重试执行时有用
    #returns        : any                                   // 执行结果，如果出错则是一个错误对象
    #status         : QueueTaskStatus = QueueTaskStatus.Queuing
    constructor(public executor:QueueTaskDispatcher, public method:Function,public args:any[] = []) {
        this.id = ++QueueTask.seq
        this.#inqueueTime= Date.now()     
        this._reset()
    }
    get status():QueueTaskStatus{ return this.#status }
    get cancelled():boolean{ return this.#status == QueueTaskStatus.Cancelled}
    get inqueueTime():number{ return this.#inqueueTime }
    
    /**
     * 此方法不能直接调用，在push任务时或新建时用来订阅事件
     */
    _reset(){
        this.executor.once(`${this.id}:executing`,this._onBeginTask.bind(this))
        this.executor.once(`${this.id}:done`,this._onEndTask.bind(this))
        this.#status = QueueTaskStatus.Queuing
        this.#returns = undefined
    }
    _onEndTask(error:Error | undefined,results:any){
        this.#status = QueueTaskStatus.Done
        this.#returns = error instanceof Error ? error : results
    }
    _onBeginTask(){
        this.#status = QueueTaskStatus.Executing
    }

    /**
     * 返回任务执行的返回值
     */
    get returns(){  
        if(this.#status == QueueTaskStatus.Done){
            return this.#returns
        }else{
            throw new Error("The Task has not been completed")
        }        
    } 
    /**
     * 等待任务执行完毕
     */ 
    async done(){
        if(this.#status==QueueTaskStatus.Done) return
        return new Promise<void>((resolve)=>{
            this.executor.once(`${this.id}:done`,()=>{
                resolve()
            })
        })
    } 
    /**
     * 函数执行完成后的回调
     * @param callback  (e,result)
     */
    on(callback:Function){
        this.executor.on(`${this.id}:done`,callback)
    }
    off(callback:Function){
        this.executor.off(`${this.id}:done`,callback)
    }
    once(callback:Function){
        this.executor.once(`${this.id}:done`,callback)
    }
}

export enum QueueTaskDispatcherEvents{
    idle='idle',            // 队列空闲时
    // <taskId>:executing   // 任务开始执行
    // <taskId>:done        // 任务执行完成  
}


// 正在排除的任务
export type QueueingTask ={id?:number,args:any[],runCount?:number,inqueueTime?:number} | QueueTask  

/**
 * 负责调试执行任务
 * 每个执行器均具有一个唯一的id
 */
export class QueueTaskDispatcher{
    #tasks:QueueingTask[] = []
    #waitForTask:IAsyncSignal = asyncSignal()     // 当有任务时的等待信号
    #hasNewTask:boolean = false                     // 自上一次pop后是否有新任务进来
    #options:Required<QueueOptions>
    #running:boolean = false
    #isIdle:boolean = false
    #eventemitter:LiteEventEmitter
    #method:Function
    constructor(method:Function, options: QueueOptions ){
        this.#options= Object.assign({
            id:0,
            retryCount:0,
            retryInterval:0,
            timeout:0,
            length:8,
            overflow:'slide',
            maxQueueTime:0,
            failure:"ignore"
        },options) as Required<QueueOptions>
        this.#method = method
        this.#eventemitter = new LiteEventEmitter()  
    }    


    get id(): string  { return String(this.#options.id) }
    get options(): QueueOptions{ return this.#options}
    get running(): boolean{ return this.#running}
    get retryCount(): number{ return this.#options.retryCount}
    get maxQueueTime(): number{ return this.#options.maxQueueTime}
    get retryInterval(): number{ return this.#options.retryInterval}
    get timeout(): number{ return this.#options.timeout}
    get failure(): QueueFailureBehaviour{ return this.#options.failure}
    get bufferLength(): number{ return this.#options.length }
    get bufferOverflow(): QueueOverflowOptions{ return this.#options.overflow} 
    get eventemitter():LiteEventEmitter{ return this.#eventemitter }
    
    async _executeMethod(task:QueueingTask,timeout:number=0){
        let finalMethod = applyParams(this.#method ,...task.args)
        if(timeout>0){
            finalMethod = timeoutWrapper(finalMethod as AsyncFunction,{value:this.timeout,default:this.options.default})
        }
        return  await finalMethod()
    }   
    
    start(){
        this.#running =true;
        setTimeout(async () =>{
            while(this.#running){
                let task = await this.pop();
                if(task.runCount > this.retryCount) continue;
                if(task.cancelled) continue                
                if(this.maxQueueTime>0 && (Date.now() - task.inqueueTime>this.maxQueueTime)) continue; // 丢弃过期任务
                let totalRunCount =this.retryCount + 1
                let results,hasError 
                for(let i = 0; i < totalRunCount; i++){
                    try{ 
                        if(task instanceof QueueTask) {
                            this.emit(`${task.id}:executing`)
                        }
                        results = await this._executeMethod(task,this.timeout)
                        break
                    }catch(e:any){               
                        hasError = e         
                        if(this.failure == 'requeue'){ // 重新入列
                            this.push(task)                            
                            break
                        }else if(this.failure == 'retry'){// 重试         
                            if(i < totalRunCount && this.retryInterval>0) await delay(this.retryInterval)
                        }else{
                            break
                        }
                    }finally{                        
                        task.runCount++
                        if(task instanceof QueueTask && i==totalRunCount-1){
                            this.emit(`${task.id}:done`,hasError,results)                        
                        }
                    }
                } 
                this.#isIdle = this.#tasks.length===0
                if(this.#isIdle){
                    this.emit(QueueTaskDispatcherEvents.idle)
                }
            }            
        },0)        
    }
    /**
     * 清除队列中已超出最大排队时间的任务
     */
    _clearExpiredTasks(){
        const maxQueueTime = this.options.maxQueueTime || 0
        if(maxQueueTime == 0) return 
        const now = Date.now()
        for(var i=this.#tasks.length-1;i>=0;i--){
            const inqueueTime = this.#tasks[i].inqueueTime || 0
            if(now - inqueueTime > maxQueueTime){
                this.#tasks.splice(i,1)
            } 
        }
    }
    /**
     * 取出最后一个任务，如果没有任务则等待
     */
    async pop():Promise<QueueTask>{
        if(this.#tasks.length>0){
            if(isFunction(this.options.priority) && this.#hasNewTask){
                this.#hasNewTask = false;
                try{
                    if(isFunction(this.options.priority)){
                        this.#tasks = (this.options.priority as Function)(this.#tasks)
                    }else if(typeof(this.options.priority)=='string'){
                        // this.#tasks =this.#tasks.sort((task1,task2) => {
                            
                        // })
                    }                    
                }catch(e){

                }
            }
            return this.#tasks.shift() as QueueTask;
        }
        // 等待新任务的到来
        return await this.#waitForTask()
    }
    stop(){
        this.#running =false
    }
    /**
     * 清空所有任务
     */
    clear(){
        this.#tasks = []
    }
    /**
     * 添加信息
     * @param task 
     */
    push(task : QueueingTask):QueueTask | undefined {        
        let newTask = task
        if(task instanceof QueueTask){
            task._reset()
            newTask = task
        }else if(this.options.objectify){
            newTask = new QueueTask(this,this.#method,task.args)            
        }else{
            newTask = { args:task.args,runCount:0,inqueueTime:Date.now() }
        }  
        // 清除过期的任务
        if(this.#tasks.length>=this.bufferLength){
            this._clearExpiredTasks()
        }
        if(this.#tasks.length>=this.bufferLength){
            switch(this.bufferOverflow){
                case "discard":
                    return 
                case "overlap": // 覆盖最后一个
                    this.#tasks[this.#tasks.length-1] = newTask
                    break
                case "slide":  // 挤走最早的一个
                    this.#tasks.shift()                 
                    this.#tasks.push(newTask)
                    break  
            }
        }else{
            this.#tasks.push(newTask)
        }
        this.#isIdle = false
        this.#hasNewTask = true
        this.#waitForTask.resolve()
        if(this.options.objectify) return newTask as QueueTask
    }
    /**
     * 等待队列为空 
     */
    async waitForIdle(){
        if(this.#isIdle) return 
        await this.#eventemitter.wait("idle")
    }    
    on(event:string,callback:Function){
        return this.#eventemitter.on(event,callback)
    }
    off(event:string,callback:Function){
        return this.#eventemitter.off(event,callback)
    }
    once(event:string,callback:Function){
        return this.#eventemitter.once(event,callback)
    }
    emit(event:string,...args:any[]){
        this.#eventemitter.emit(event,...args)
    }
}


export class QueueManager extends DecoratorManager{
    // {<实例>:{[装饰器id]:<Executor实例>},...}
    #dispatchers: Map<object,Map<string,QueueTaskDispatcher>> = new Map()
    constructor(decoratorName:string,options:DecoratorManagerOptions){
        super(decoratorName,options)
    }  
    /**
     * 返回队列执行器实例
     * @param instance 
     * @returns 
     */
    getDispatcher(instance: object,dispatcherId:string):QueueTaskDispatcher | undefined {
        if(this.hasDispatcher(instance,dispatcherId)){
            return (this.#dispatchers.get(instance) as Map<string,QueueTaskDispatcher>).get(dispatcherId)
        }
    }
    /**
     * 登记队列管理器
     * @param instance 
     * @param dispatcher 
     */
    addDispatcher(instance: object,dispatcher:QueueTaskDispatcher){
        if(!this.#dispatchers.has(instance)){
            this.#dispatchers.set(instance,new Map<string,QueueTaskDispatcher>())
        }
        let instanceDispatchers = this.#dispatchers.get(instance)   
        if(instanceDispatchers){
            instanceDispatchers.set(dispatcher.id,dispatcher);
        }  
    }
    removeDispatcher(instance: object,dispatcherId:string){
        if(!this.#dispatchers.has(instance)){
            return            
        }
        let instanceDispatchers = this.#dispatchers.get(instance)   
        if(instanceDispatchers){
            if(instanceDispatchers.has(dispatcherId)){
                instanceDispatchers.delete(dispatcherId)
            }
            if(instanceDispatchers.size == 0){
                this.#dispatchers.delete(instance)
            }
        }
    }
    createDispatcher(instance: object,method:Function,options:QueueOptions):QueueTaskDispatcher{
        let dispatcher = new QueueTaskDispatcher(method,options)
        dispatcher.start()
        this.addDispatcher(instance,dispatcher)
        return dispatcher
    }    
    hasDispatcher(instance: object,dispatcherId:string):boolean{
        if(this.#dispatchers.has(instance)){
            return (this.#dispatchers.get(instance) as Map<string,QueueTaskDispatcher>).has(dispatcherId)
        }else{
            return false
        }
    }
    /**
     * 获取执行器，如果不存在则创建
     * @param instance 
     * @param executorId 
     */
    getAndCreateDispatcher(instance: object,method:Function,options:QueueOptions):QueueTaskDispatcher{
        let dispatcherId = options.id || ''
        if(this.hasDispatcher(instance,dispatcherId)){
            return this.getDispatcher(instance,dispatcherId) as QueueTaskDispatcher 
        }else{
            return this.createDispatcher(instance,method,options) 
        }
    }
}


export const queue = createDecorator<QueueOptions,any,number>("queue",
    {
        length:8,
        overflow     : 'discard',
        priority     : null,
        failure      : "ignore",
        retryCount   : 0,
        retryInterval: 0,
        timeout      : 0,
        default      : undefined,
        objectify    : false
    },{
        wrapper: function(method:Function,options:QueueOptions,manager:DecoratorManager):Function {
            return function(this:any):QueueTask | undefined {
                let dispatcher:QueueTaskDispatcher
                dispatcher  = (manager as QueueManager).getAndCreateDispatcher(this,method.bind(this),options)
                if(dispatcher){
                    return dispatcher.push({args:[...arguments]}) 
                }else{
                    throw new Error("QueueTaskExecutor not available")
                }              
            }       
        },
        defaultOptionKey:"length",
        asyncWrapper:false,
        manager:{
            initial:'once',
            creator:QueueManager
        }
    })

 
 



