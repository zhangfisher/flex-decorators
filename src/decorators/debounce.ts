import { createMethodDecorator } from "../methods"
import type {MethodDecoratorOptions} from "../methods"
import type {AsyncFunction } from "../types"
import debounceWrapper from "../wrappers/debounce"

export interface DebounceOptions extends MethodDecoratorOptions { 
    interval:number, 
    atBegin?:boolean
}
export interface IGetDebounceDecoratorOptions {
    getDebounceDecoratorOptions(options:DebounceOptions,methodName:string | symbol,decoratorName:string):DebounceOptions
}

export const debounce = createMethodDecorator<DebounceOptions>("debounce",{interval:1000,atBegin:true},{
    wrapper: function(method:AsyncFunction,options:DebounceOptions):Function{
        return debounceWrapper(method,options)
    },
    proxyOptions:true,
    defaultOptionKey:"interval"
})
