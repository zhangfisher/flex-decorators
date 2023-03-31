import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator"
import type {AsyncFunction } from "flex-tools"
import debounceWrapper from "../wrappers/debounce"

export interface DebounceOptions extends DecoratorOptions { 
    interval:number, 
    atBegin?:boolean
}
export interface IDebounceDecoratorOptionsReader {
    getDebounceDecoratorOptions(options:DebounceOptions,methodName:string | symbol,decoratorName:string):DebounceOptions
}

export const debounce = createDecorator<DebounceOptions>("debounce",{interval:1000,atBegin:true},{
    wrapper: function(method:AsyncFunction,options:DebounceOptions):Function{
        return debounceWrapper(method,options)
    },
    defaultOptionKey:"interval"
})
