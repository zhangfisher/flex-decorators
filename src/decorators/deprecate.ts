/**
 * 在控制台给出废弃警告
 
*/

import { createDecorator } from "../decorator"
import type {DecoratorOptions} from "../decorator" 
import { IDecoratorManager } from "../manager"

export interface DeprecateOptions extends DecoratorOptions { 
    tips?: string,
    url?: string 
}

export const deprecate  = createDecorator<DeprecateOptions>("deprecate ",{tips:"",url:undefined},{
    wrapper: function(method:Function,options:DeprecateOptions,manager:IDecoratorManager, target:Object, propertyKey: string|symbol,descriptor:PropertyDescriptor):Function{
        return function(this:any,...args:any[]):Function{ 
            let tips = `DEPRECATION: Method<${target.constructor.name}#${String(propertyKey)}> has been deprecated`
            if(options.tips) tips+=","+options.tips
            if(options.url){
                tips+=`\nSee ${options.url} for more details.\n\n`;
            }            
            console.warn(tips)
            return method.apply(this,args)    
        }
        


    },
    defaultOptionKey:"tips"
})
