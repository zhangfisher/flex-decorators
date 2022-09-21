import { createMethodDecorator } from "../methods"
import type {MethodDecoratorOptions} from "../methods"
import noReentryWrapper from "../wrappers/noReentry"
 
export interface NoReentryOptions extends MethodDecoratorOptions { 
    silence?:boolean           // 默认true,当重入时默默地返回,=false时会触发错误
}

export interface IGetNoReentryDecoratorOptions {
    getRetryDecoratorOptions(options:NoReentryOptions,methodName:string | symbol,decoratorName:string):NoReentryOptions
}


export const noReentry = createMethodDecorator<NoReentryOptions>("noReentry",{silence:true},{
    wrapper: function(method:Function,options:NoReentryOptions):Function{
        return noReentryWrapper(method,options)
    },
    proxyOptions:true,
    defaultOptionKey:"silence"
})