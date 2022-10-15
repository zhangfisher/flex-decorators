/**
 * 对输入参数进行规范化
 * 
 * @verifyArgs((args)=>{})      // return true/false
 * test({})
 * 
 * @verifyArgs([arg1,arg2,{}])         // 提供参数默认值
 * test({})
 * 
   @verifyArgs({})         // 提供参数默认值
 * test({})
 * 
 * - 如果参数不合法，则抛出错误代码
 * - 提供参数默认值
 * - 补全缺失的参数
 * - 规范为统一格式
 * 
 */

 import { createDecorator } from "../decorator"
 import type {DecoratorOptions} from "../decorator"
import { deepMerge, isAsyncFunction, isPlainObject, mixinArray } from "../utils"
 
 export interface VerifyArgsOptions extends DecoratorOptions { 
    validate?:(args: any[]) => any | [] | Record<string | symbol, any> | undefined         // 应该返回规范化后的参数
 }
 export interface IVerifyArgsDecoratorOptionsReader {
     getVerifyArgsDecoratorOptions(options:VerifyArgsOptions,methodName:string | symbol,decoratorName:string):VerifyArgsOptions
 }
  
 export const verifyArgs = createDecorator<VerifyArgsOptions>("verifyArgs",{validate:undefined},{
     wrapper: function(method:Function,options:VerifyArgsOptions):Function{
        let validateType = typeof options.validate
        if(validateType=="function"){
            if(isAsyncFunction(method) || isAsyncFunction(options.validate)){
                return async function(this:any,...args:any[]){
                    let verifiedArgs = args
                    if(options.validate){
                        verifiedArgs =await options.validate.call(this,args)
                        if(typeof(verifiedArgs)=='boolean'){
                            if(verifiedArgs==false){
                                throw new TypeError()
                            }else{
                                verifiedArgs = args
                            }
                        }else if(!Array.isArray(verifiedArgs)){
                            verifiedArgs = [verifiedArgs]
                        }
                    }                        
                    return await method.apply(this,verifiedArgs)
                }
            }else{
                return function(this:any,...args:any[]){
                    let verifiedArgs = args
                    if(options.validate){
                        verifiedArgs = options.validate.call(this,args)
                        if(typeof(verifiedArgs)=='boolean'){
                            if(verifiedArgs==false){
                                throw new TypeError()
                            }else{
                                verifiedArgs = args
                            }
                        }else if(!Array.isArray(verifiedArgs)){
                            verifiedArgs = [verifiedArgs]
                        }
                    }                        
                    return method.apply(this,verifiedArgs)
                }
            }
        }else if(isPlainObject(options.validate)) { // 仅适用于只有一个参数且类型是{}
            return function(this:any,...args:any[]){
                let verifiedArgs:any[] = []
                if(args.length==0){
                    verifiedArgs.push(options.validate)
                }else if(isPlainObject(args[0])){
                    verifiedArgs = [Object.assign({},args[0])]
                    verifiedArgs[0] = deepMerge(options.validate as Record<string,any>,args[0])
                }
                return method.apply(this,verifiedArgs)
            }   
        }else if(Array.isArray(options.validate)) {  
            return function(this:any,...args:any[]){
                let finalArgs = mixinArray(args,options.validate as unknown as [])
                return method.apply(this,finalArgs)
            }
        }else{
            return method 
        }        
     },
     defaultOptionKey:"validate"
 })
 