import { createMethodDecorator } from "../methods"
import type {MethodDecoratorOptions} from "../methods"
import type {AsyncFunction } from "../types"
import throttleWrapper from "../wrappers/throttle"

export interface ThrottleOptions extends MethodDecoratorOptions { 
    interval     : number,
    noLeading?   : boolean,
    noTrailing?  : boolean,
    debounceMode?: boolean
}
export interface IGetThrottleDecoratorOptions {
    getThrottleDecoratorOptions(options:ThrottleOptions,methodName:string | symbol,decoratorName:string):ThrottleOptions
}

export const throttle = createMethodDecorator<ThrottleOptions>("throttle",
    {
        interval    : 1000,
        noTrailing  : false,          // 最后一次调用时是否执行
        noLeading   : false,
        debounceMode: undefined
    },{
        wrapper: function(method:AsyncFunction,options:ThrottleOptions):Function{
            return throttleWrapper(method,options)
        },
        proxyOptions:true,
        defaultOptionKey:"interval"
    })


