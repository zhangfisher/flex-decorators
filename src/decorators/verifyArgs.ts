/**
 * 对输入参数进行规范化
 * 
 * @verifyArgs((args)=>{})
 * test({})
 * - 如果参数不合法，则抛出错误代码
 * - 提供参数默认值
 * - 补全缺失的参数
 * - 规范为统一格式
 * 
 */

 import { createDecorator } from "../decorator"
 import type {DecoratorOptions} from "../decorator"
import { isAsyncFunction } from "../utils"
 
 export interface NormalizeArgsOptions extends DecoratorOptions { 
    validate?:(this:any,args: any[]) => any | undefined         // 应该返回规范化后的参数
 }
 export interface INormalizeArgsDecoratorOptionsReader {
     getNormalizeArgsDecoratorOptions(options:NormalizeArgsOptions,methodName:string | symbol,decoratorName:string):NormalizeArgsOptions
 }
 
 export const verifyArgs = createDecorator<NormalizeArgsOptions>("verifyArgs",{validate:undefined},{
     wrapper: function(method:Function,options:NormalizeArgsOptions):Function{
        if(typeof options.validate=="function"){
            if(isAsyncFunction(method) || isAsyncFunction(options.validate)){
                return async function(this:any,...args:any[]){
                    let verifiedArgs = args
                    if(options.validate){
                        verifiedArgs =await options.validate.call(this,args)
                    }                        
                    return await method.apply(this,verifiedArgs)
                }
            }else{
                return function(this:any,...args:any[]){
                    let verifiedArgs = args
                    if(options.validate){
                        verifiedArgs = options.validate.call(this,args)
                    }                        
                    return method.apply(this,verifiedArgs)
                }
            }
        }else{
            return method
        }        
     },
     defaultOptionKey:"validate"
 })
 