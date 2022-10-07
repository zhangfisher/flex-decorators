/**
 * 
 * 排队调用被装饰的方法
 * 
 * 
 

 */
import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AllowNull, AsyncFunction } from "../types"
import {DecoratorManager, createManagerDecorator,DecoratorManagerOptions } from "../manager"
import { asyncSignal,IAsyncSignal } from "../asyncSignal"
import { applyParams, delay, isFunction } from "../utils"
import timeoutWrapper from "../wrappers/timeout" 

export type QueueFailureBehaviour  = "ignore" | "retry" | "requeue"
export type QueueOverflowOptions = 'discard' | 'overlap' | 'slide' 
export interface QueueOptions extends DecoratorOptions {
    length?:number,    
    overflow: QueueOverflowOptions        // 队列溢出时的处理方式,discard=丢弃,overlap=覆盖最后一条,slide=挤出最早一条
    priority?:AllowNull<(tasks:QueueTask[])=>QueueTask[]>             // 优先级
    failure: QueueFailureBehaviour           // 执行出错时的行为，none=什么都不做,retry=重试,requeue=重新排队，但是受retryCount限制
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
    id:number=0                                
    createTime?:number                           // 创建任务的时间
    lastExecuteTime?:number                      // 最近一次执行的时间
    runCount:number=0                            // 执行次数，当出错重试执行时有用
    #returns:any     
    #status:QueueTaskStatus = QueueTaskStatus.Waiting
    #abort:boolean = false                      // 中止标志
    #callbacks:QueueTaskExecuteCallback[]=[]
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

class QueueTaskExecutor{
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
    get options(): QueueOptions{ return this.#options}
    get running(): boolean{ return this.#running}
    get retryCount(): number{ return this.#options.retryCount || 0}
    get timeout(): number{ return this.#options.timeout || 0}
    get retryInterval(): number{ return this.#options.retryInterval || 0}
    get failure(): QueueFailureBehaviour{ return this.#options.failure || 'none'}
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



class QueueManager extends DecoratorManager{
    constructor(decoratorName:string,options:Record<string,any>){
        super(decoratorName,options)
    }
    async onStart(){
        
    }
}


export const queue = createDecorator<QueueOptions,AsyncFunction,number>("queue",
    {
        length:8,
        overflow:'discard',
        priority     : null,
        failure      : "ignore",
        retryCount   : 0,
        retryInterval: 0,
        timeout      : 0,
        default      : undefined
    },{
        wrapper: function(method:AsyncFunction,options:QueueOptions):AsyncFunction{
            let executor:QueueTaskExecutor
            return async function(this:any){
                if(!executor) {
                    executor = new QueueTaskExecutor(options)
                    executor.start()
                }
                return executor.push({method:method.bind(this),args:arguments})
            }
        },
        defaultOptionKey:"length",
        manager:QueueManager
    })

 
 



