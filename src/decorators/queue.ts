/**
 * 
 * 排队调用被装饰的方法
 * 
 * 
 

 */
import { createDecorator, DecoratorContext, DecoratorMethodContext } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AllowNull, AsyncFunction } from "../types"
import {DecoratorManager,  IDecoratorManagerHook } from "../manager"
import { asyncSignal,IAsyncSignal } from "../asyncSignal"
import { applyParams, delay,  isFunction } from "../utils"
import timeoutWrapper from "../wrappers/timeout"

export type QueueFailureBehaviour  = "ignore" | "retry" | "requeue"
export type QueueOverflowOptions = 'discard' | 'overlap' | 'slide' 

export interface QueueOptions extends DecoratorOptions {
    id?:string
    length?:number   
    overflow: QueueOverflowOptions        // 队列溢出时的处理方式,discard=丢弃,overlap=覆盖最后一条,slide=挤出最早一条
    priority?:AllowNull<(tasks:QueueTask[])=>QueueTask[]>             // 优先级
    failure?: QueueFailureBehaviour           // 执行出错时的行为，ignore=什么都不做,retry=重试,requeue=重新排队，但是受retryCount限制
    retryCount?:number
    retryInterval?:number
    timeout?:number
    default?: any                                   // 如果提供则返回该默认值而不是触发错误
}

export interface IQueueDecoratorOptionsReader {
    getQueueDecoratorOptions(options:QueueOptions,methodName:string | symbol,decoratorName:string):QueueOptions
}
export enum QueueTaskStatus{
    Waiting=0,                              // 正在等待执行
    Executing=1,                            // 正在执行
    Completed=2,                            // 已执行完成
    Error=3                                 // 执行出错
}

export type QueueTaskExecuteCallback = (error:Error | undefined,result:any) => void

export class QueueTask{
    id              : number=0                                
    createTime?     : number                           // 创建任务的时间
    lastExecuteTime?: number                      // 最近一次执行的时间
    runCount        : number=0                            // 执行次数，当出错重试执行时有用
    #returns        : any     
    #status         : QueueTaskStatus = QueueTaskStatus.Waiting
    #abort          : boolean = false                      // 中止标志
    #callbacks      : QueueTaskExecuteCallback[]=[]
    constructor(public method:AsyncFunction,public args:any[] = []) {
        this.createTime= Date.now()         
    }
    get status():QueueTaskStatus{ return this.#status    }
    get abort():boolean { return this.#abort}
    set abort(value:boolean) { this.#abort = value }
    /**
     * 返回任务执行的返回值
     */
    get returns(){  
        if(this.#status == QueueTaskStatus.Completed){
            return this.#returns
        }else{
            throw new Error("The Task has not been completed")
        }        
    } 
    async execute(timeout:number=0,defaultValue?:any){
        let finalMethod = applyParams(this.method,...this.args)
        if(timeout>0){
            finalMethod = timeoutWrapper(finalMethod as AsyncFunction,{value:timeout,default:defaultValue})
        }
        let hasError:Error | undefined = undefined 
        try{
            this.#returns = await finalMethod()
        }catch(e){
            hasError = e as Error
        }finally{
            this.#callbacks.forEach(callback =>{try{callback(undefined,this.#returns)}catch{}})
        }
        if(hasError) throw hasError
    }   
    /**
     * 等待任务执行完毕
     */ 
    async wait(){
        if(this.#status==QueueTaskStatus.Completed) return
        return new Promise<void>((resolve)=>{
            let listener = ()=>{
                this.off(listener)
                resolve()
            }
            this.on(listener)
        })
    }
    /**
     * 函数执行完成后的回调
     * @param callback  (e,result)
     */
    on(callback:QueueTaskExecuteCallback){
        this.#callbacks.push(callback)
    }
    off(callback:QueueTaskExecuteCallback){
        let index = this.#callbacks.indexOf(callback)
        if(index>-1) this.#callbacks.splice(index, 1)
    }
}

/**
 * 负责调试执行任务
 * 每个执行器均具有一个唯一的id
 */
export class QueueTaskExecutor{
    #tasks:QueueTask[] = []
    #waitForTask:IAsyncSignal = asyncSignal()     // 当有任务时的等待信号
    #hasNewTask:boolean = false                     // 自上一次pop后是否有新任务进来
    #options:QueueOptions
    #running:boolean = false
    constructor( options: QueueOptions ){
        this.#options= Object.assign({
            retryCount:0,
            retryInterval:0,
            timeout:0,
            length:8,
            overflow:'slide'
        },options)
    }    
    get id(): string  { return String(this.#options.id) }
    get options(): QueueOptions{ return this.#options}
    get running(): boolean{ return this.#running}
    get retryCount(): number{ return this.#options.retryCount || 0}
    get timeout(): number{ return this.#options.timeout || 0}
    get retryInterval(): number{ return this.#options.retryInterval || 0}
    get failure(): QueueFailureBehaviour{ return this.#options.failure || 'ignore'}
    get bufferLength(): number{ return this.#options.length  || 8 }
    get bufferOverflow(): QueueOverflowOptions{ return this.#options.overflow  }
    start(){
        this.#running =true;
        setTimeout(async () =>{
            while(this.#running){
                let task = await this.pop();
                if(task.runCount > this.retryCount) continue;
                if(task.abort) continue
                
                // 开始执行
                let totalRunCount =this.retryCount + 1
                for(let i = 0; i < totalRunCount; i++){
                    try{ 
                        await task.execute()
                        break
                    }catch(e){
                        if(this.failure == 'requeue'){ // 重新入列
                            this.push(task)                            
                            break
                        }else if(this.failure == 'retry'){// 重试         
                            if(i < totalRunCount) await delay(this.retryInterval)
                        }else{
                            break
                        }
                    }finally{
                        task.runCount++
                    }
                }                
            }            
        },0)        
    }
    /**
     * 取出最后一个任务，如果没有任务则等待
     */
    async pop():Promise<QueueTask>{
        if(this.#tasks.length>0){
            if(isFunction(this.options.priority) && this.#hasNewTask){
                this.#hasNewTask = false;
                try{
                    this.#tasks = (this.options.priority as Function)(this.#tasks)
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
    push(task : {method:any,args: any} | QueueTask){        
        let newTask 
        if(task instanceof QueueTask){
            newTask = task
        }else{
            newTask = new QueueTask(task.method,task.args)
        }  
        if(this.#tasks.length>=this.bufferLength){
            switch(this.bufferOverflow){
                case "discard":
                    return 
                case "overlap": // 覆盖最后一个
                    this.#tasks[this.#tasks.length-1] = newTask
                    break
                case "slide":  // 挤走最早的一个
                    this.#tasks.splice(0,1,newTask)                 
                    break  
            }
        }else{
            this.#tasks.push(newTask)
        }
        this.#hasNewTask = true
        this.#waitForTask.resolve()
        return newTask
    }
}



export class QueueManager extends DecoratorManager implements IDecoratorManagerHook{
    // {<实例>:{[装饰器id]:<Executor实例>},...}
    #executors: Map<object,Map<string,QueueTaskExecutor>> = new Map()
    constructor(decoratorName:string,options:Record<string,any>){
        super(decoratorName,options)
    }  
    onBeforeCall(instance: object, args: any[], methodContext: DecoratorMethodContext, decoratorContext: DecoratorContext): void {
        throw new Error("Method not implemented.")
    }
    onAfterCall(instance: object, returns: any, methodContext: DecoratorMethodContext, decoratorContext: DecoratorContext): void {
        throw new Error("Method not implemented.")
    }
    async onStart(){

    }
    /**
     * 返回队列执行器实例
     * @param instance 
     * @returns 
     */
    getExecutor(instance: object,executorId:string):QueueTaskExecutor | undefined {
        if(this.hasExecutor(instance,executorId)){
            return (this.#executors.get(instance) as Map<string,QueueTaskExecutor>).get(executorId)
        }
    }
    /**
     * 登记队列管理器
     * @param instance 
     * @param executor 
     */
    addExecutor(instance: object,executor:QueueTaskExecutor){
        if(!this.#executors.has(instance)){
            this.#executors.set(instance,new Map<string,QueueTaskExecutor>())
        }
        let instanceExecutors = this.#executors.get(instance)   
        if(instanceExecutors){
            instanceExecutors.set(executor.id,executor);
        }  
    }
    removeExecutor(instance: object,executorId:string){

    }
    createExecutor(instance: object,options:QueueOptions):QueueTaskExecutor{
        let executor = new QueueTaskExecutor(options)
        executor.start()
        this.addExecutor(instance,executor)
        return executor
    }    
    hasExecutor(instance: object,executorId:string):boolean{
        if(this.#executors.has(instance)){
            return (this.#executors.get(instance) as Map<string,QueueTaskExecutor>).has(executorId)
        }else{
            return false
        }
    }
    /**
     * 获取执行器，如果不存在则创建
     * @param instance 
     * @param executorId 
     */
    getAndCreateExecutor(instance: object,options:QueueOptions):QueueTaskExecutor{
        let executorId = options.id || ''
        if(this.hasExecutor(instance,executorId)){
            return this.getExecutor(instance,executorId) as QueueTaskExecutor 
        }else{
            return this.createExecutor(instance,options) 
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
        default      : undefined
    },{
        wrapper: function(method:Function,options:QueueOptions,manager:DecoratorManager):Function {
            return function(this:any):QueueTask | undefined {
                let executor:QueueTaskExecutor
                executor  = (manager as QueueManager).getAndCreateExecutor(this,options)
                if(executor){
                    return executor.push({method:method.bind(this),args:arguments}) 
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

 
 



