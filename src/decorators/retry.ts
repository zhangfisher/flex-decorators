
import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import { retry as retryWrapper} from "flex-tools/func/retry"
 
export interface RetryOptions extends DecoratorOptions {
    count?   : number               // 重试次数
    interval?: number               //重试间隔
    default? : any                  // 失败时返回的默认值
}
export interface IRetryDecoratorOptionsReader {
    getRetryDecoratorOptions(options:RetryOptions,methodName:string | symbol,decoratorName:string):RetryOptions
}

export const retry = createDecorator<RetryOptions,RetryOptions['count']>("retry",{count:1,interval:0,default:null},{
    wrapper: function(method:Function,options:RetryOptions):Function{
        return retryWrapper(method,options)
    },
    defaultOptionKey:"count"
})
