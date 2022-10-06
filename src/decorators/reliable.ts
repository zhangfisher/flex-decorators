import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import reliableWrapper from "../wrappers/reliable"
import type { AsyncFunction } from "../types"
 
export interface ReliableOptions extends DecoratorOptions { 
    timeout         : number,                            // 执行失败超时,默认为1分钟
    retryCount      : number,                            // 重试次数
    retryInterval   : number,                            // 重试间隔
    debounce        : number,                            // 去抖动
    throttle        : number,                            // 节流
    noReentry       : boolean,                           // 不可重入
}

export interface IReliableDecoratorOptionsReader {
    getRetryDecoratorOptions(options:ReliableOptions,methodName:string | symbol,decoratorName:string):ReliableOptions
}

export const reliable = createDecorator<ReliableOptions>("reliable",
    {
        timeout      : 0,                            // 执行失败超时,默认为1分钟
        retryCount   : 0,                            // 重试次数
        retryInterval: 1000,                         // 重试间隔
        debounce     : 0,                            // 去抖动
        throttle     : 0,                            // 节流
        noReentry    : false,                        // 不可重入
    },{
    wrapper: function(method:AsyncFunction,options:ReliableOptions):AsyncFunction{
        return reliableWrapper(method,options)
    }
})
