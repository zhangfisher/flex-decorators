import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AsyncFunction } from "flex-tools"
import {timeout as timeoutWrapper} from "flex-tools"

// ------------------------ TIMEOUT ------------------------ 
export interface TimeoutOptions extends DecoratorOptions {
    value?  : number,                   // 超时时间
    default?: any                       // 如果提供则返回该默认值而不是触发错误
}
export interface ITimeoutDecoratorOptionsReader {
    getTimeoutDecoratorOptions:((options:TimeoutOptions,methodName:string | symbol,decoratorName:string)=>TimeoutOptions) | ((options:TimeoutOptions,methodName:string | symbol,decoratorName:string)=>Promise<TimeoutOptions>)
}

export const timeout = createDecorator<TimeoutOptions,AsyncFunction,number>("timeout",
    {
        value:0,                            
        default:null
    },{
        wrapper: function(method:AsyncFunction,options:TimeoutOptions):AsyncFunction{
            return timeoutWrapper(method,options)
        },
        defaultOptionKey:"value"
    })