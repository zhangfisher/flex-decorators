/**
 * 记住最后一次执行的
 */

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
import { isAsyncFunction   } from "../utils"

export interface MemorizeOptions extends DecoratorOptions { 
    // 根据参数计算hash值的函数 | length=参数个数 | undefined=永远返回最近的值
    hash?: ((args: any[]) => string) | 'length' | undefined  
    expires?:number                             // 有效时间，当超过后失效 
}
export interface IMemorizeDecoratorOptionsReader {
    getMemorizeDecoratorOptions(options:MemorizeOptions,methodName:string | symbol,decoratorName:string):MemorizeOptions
}

export const memorize = createDecorator<MemorizeOptions>("memorize",{hash:undefined,expires:0},{
    wrapper: function(method:Function,options:MemorizeOptions):Function{
        let result:any
        let preHash:string | undefined
        let timestamp :number = 0
        const getHash=function(this:any,args: any[]){
            return options.hash == 'length' ? String(args.length) : (typeof options.hash == 'function' ? options.hash.call(this,args) : undefined )
        }
        const isInvalid = (hash: string | undefined):boolean => result===undefined || (hash!=undefined && hash!=preHash) || (options.expires && options.expires>0 && timestamp>0 && (Date.now() - timestamp)> options.expires) as boolean

        if(isAsyncFunction(method)){
            return async function(this:any,...args:any[]){
                let hash = getHash.call(this,args)
                if(isInvalid(hash)){
                    result =await method.apply(this,args)
                    timestamp = Date.now()
                    preHash = hash
                }
                return result
            }
        }else{
            return function(this:any,...args:any[]){
                let hash = getHash.call(this,args)
                if(isInvalid(hash)){
                    result = method.apply(this,args)
                    timestamp = Date.now()
                    preHash = hash
                }
                return result
            }
        }
        
    },
    defaultOptionKey:"hash"
})
