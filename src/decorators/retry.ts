
import { createDecorator } from "../methods"
import type {DecoratorOptions} from "../methods"
import retryWrapper from "../wrappers/retry"
 
export interface RetryOptions extends DecoratorOptions {
    count?   : number               // 重试次数
    interval?: number               //重试间隔
    default? : any                  // 失败时返回的默认值
}
export interface IGetRetryDecoratorOptions {
    getRetryDecoratorOptions(options:RetryOptions,methodName:string | symbol,decoratorName:string):RetryOptions
}

export const retry = createDecorator<RetryOptions>("retry",{count:1,interval:0,default:null},{
    wrapper: function(method:Function,options:RetryOptions):Function{
        return retryWrapper(method,options)
    },
    proxyOptions:true,
    defaultOptionKey:"count"
})
