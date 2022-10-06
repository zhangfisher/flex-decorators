/**
 * 
 * 排队调用被装饰的方法
 * 
 * 
 

 */
import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AsyncFunction } from "../types"
import {DecoratorManager, createManagerDecorator,DecoratorManagerOptions } from "../manager"
import { asyncSignal,IAsyncSignal } from "../asyncSignal"


export enum QueueBufferOverflowBehaviour {
    Discard = 0,                            // 丢弃
    Overlap =1,                             // 覆盖最后一个
    Expand = 2,                             // 扩展缓冲区
    Slide = 3,                              // 滑动缓冲区
    ExpandAndSlide = 4                      // 先扩展再滑动   
}

export interface QueueOptions extends DecoratorOptions {
    size?  : number,                                // 队列大小,默认值是8
    maxSize? : number,                              // 缓冲区最大值
    priority?:Function | undefined,                 // 优先级
    overflow?:QueueBufferOverflowBehaviour,         // 队列溢出时的处理方式, 
    default?: any                                   // 如果提供则返回该默认值而不是触发错误
}

export interface IQueueDecoratorOptionsReader {
    getQueueDecoratorOptions(options:QueueOptions,methodName:string | symbol,decoratorName:string):QueueOptions
}

export interface QueueTask{
    id?:number,                                
    timestamp?:number                       // 放进队列的时间
    args:any[],
    method:AsyncFunction
}

class QueueManager extends DecoratorManager{
    
}

class QueueTaskExecutor{
    #tasks:QueueTask[] = []
    #isExecuting:boolean = false
    #hasTaskSignal:IAsyncSignal = asyncSignal()
    constructor(options: QueueOptions ){
        //this.#hasTaskSignal = asyncSignal()
    }
    async start(){
        while(true){
            // 从队列中取出
            let task =await this._pop();
            if(task.method){
                await task.method(...task.args);
            }
        }
    }
    /**
     * 取出最后一个任务，如果没有任务则等待
     */
    async _pop():Promise<QueueTask>{
        if(this.#tasks.length>0){
            this.#tasks.splice(0,1)
        }
        return await this.#hasTaskSignal()
    }
    async stop(){

    }
    /**
     * 添加信息
     * @param task 
     */
    push(method:any,args: any){
        let task = {
            id:1,
            timestamp:Date.now(),
            args: args,
            method
        }
        this.#tasks.push(task)
    }
}

export const queue = createDecorator<QueueOptions,AsyncFunction,number>("queue",
    {
        size:0,                            
        default:null
    },{
        wrapper: function(method:AsyncFunction,options:QueueOptions):AsyncFunction{
            let queue = new QueueTaskExecutor(options)
            return async function(this:any){
                return queue.push(method.bind(this),arguments)
            }
        },
        defaultOptionKey:"size"
    })


export interface QueueManagerOptions extends DecoratorManagerOptions{
    size?: number;          // 队列大小
}


export const queueManager = queue






