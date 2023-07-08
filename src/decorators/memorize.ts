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
import { memorize as memorizeWrapper } from "flex-tools/func/memorize"

export interface MemorizeOptions extends DecoratorOptions { 
    // 根据参数计算hash值的函数 | length=参数个数 | undefined=永远返回最近的值
    hash?: ((args: any[]) => string) | 'length' | boolean  
    expires?:number                             // 有效时间，当超过后失效 
}
export interface IMemorizeDecoratorOptionsReader {
    getMemorizeDecoratorOptions(options:MemorizeOptions,methodName:string | symbol,decoratorName:string):MemorizeOptions
}

export const memorize = createDecorator<MemorizeOptions,MemorizeOptions['hash']>("memorize",{hash:undefined,expires:0},{
    wrapper: function(method:Function,options:MemorizeOptions):Function{
         return memorizeWrapper.call(this,method,options);        
    },
    defaultOptionKey:"hash"
})
