import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import { noReentry as noReentryWrapper } from "flex-tools/func/noReentry"
 
export interface NoReentryOptions extends DecoratorOptions { 
    silent?:boolean           // 默认true,当重入时默默地返回,=false时会触发错误
}

export interface INoReentryDecoratorOptionsReader {
    getRetryDecoratorOptions(options:NoReentryOptions,methodName:string | symbol,decoratorName:string):NoReentryOptions
}


export const noReentry = createDecorator<NoReentryOptions,NoReentryOptions['silent']>("noReentry",{silent:true},{
    wrapper: function(method:Function,options:NoReentryOptions):Function{
        return noReentryWrapper(method,options as any)
    },
    defaultOptionKey:"silent"
})