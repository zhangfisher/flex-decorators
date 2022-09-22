/**
 * 
 * 排队调用被装饰的方法

    import queueManager from "../"

    class QueueManager extends DecoratorManager{
        
        start(){

        }
        stop(){

        }        
    }

    class myClass{

    @QueueManager()
    DecoratorManager queueManager 

    constructor(){
        this.queueManager.start()
    }

    @queue(54)
    go(){

    }

    }



 */
import { createDecorator } from "../methods"
import type {DecoratorOptions} from "../methods"
import type {AsyncFunction } from "../types"
import {DecoratorManager, createManagerDecorator,DecoratorManagerOptions } from "../manager"

export interface QueueOptions extends DecoratorOptions {
    size?  : number,                    // 队列大小
    default?: any                       // 如果提供则返回该默认值而不是触发错误
}
export interface IGetTimeoutDecoratorOptions {
    getTimeoutDecoratorOptions(options:QueueOptions,methodName:string | symbol,decoratorName:string):QueueOptions
}

export const queue = createDecorator<QueueOptions,AsyncFunction,number>("queue",
    {
        size:0,                            
        default:null
    },{
        wrapper: function(method:AsyncFunction,options:QueueOptions):AsyncFunction{
            return method
        },
        proxyOptions:true,
        defaultOptionKey:"size"
    })


export interface QueueManagerOptions extends DecoratorManagerOptions{
    size?: number;          // 队列大小
}

class QueueManager extends DecoratorManager{
    async start(){

    }
    async stop(){

    }
}


export const queueManager = createManagerDecorator<QueueManager,QueueManagerOptions>(
    "queue",
    QueueManager,
    {
        enable:true,
        size:10
    }
)






