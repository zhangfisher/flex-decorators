import { createDecoratorOptions, DecoratorContext, DecoratorManagerCreateFinalOptions, DecoratorMethodContext, DecoratorOptions, defineDecoratorMetadata, handleDecoratorOptions} from "./decorator"
import { TypedMethodDecorator } from "./types"
import { firstUpperCase, isAsyncFunction } from "./utils"

// 简化版装饰器
export type createLiteDecoratorOptions<T>  = Exclude<createDecoratorOptions<T,any>,'manager' | 'autoReWrapper' | 'wrapper'>

export interface ListDecoratorCreator<T,M,D> {
    (options?:T | D):TypedMethodDecorator<M> 
}


/**
 * 创建一个简单的装饰器，不包括管理器，仅注入一些装饰元数据，以可以通过
 */
 export function createLiteDecorator<OPTIONS extends DecoratorOptions,METHOD=any,DEFAULT_OPTION=any>(decoratorName:string,defaultOptions?:OPTIONS,opts?:createLiteDecoratorOptions<OPTIONS>): ListDecoratorCreator<OPTIONS,METHOD,DEFAULT_OPTION>{
    let createOptions:createLiteDecoratorOptions<OPTIONS> = Object.assign({},opts)
    // 保存装饰器上下文信息
    let decoratorContext:DecoratorContext = {
        defaultOptions:defaultOptions as Record<string,any>,         // 装饰器默认参数
        createOptions,                                                  // 创建装饰器的参数
        decoratorName,
        manager: undefined
    }    
    // T:装饰器参数,D:装饰器默认值的类型
    function decorator(options?: OPTIONS | DEFAULT_OPTION ):TypedMethodDecorator<METHOD> {        
        return function(this:any,target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<METHOD>):TypedPropertyDescriptor<METHOD> | void {            
            // 当前装饰方法的上下文对象,
            let methodContext:DecoratorMethodContext= {
                class:target,
                methodDescriptor:descriptor,
                methodName: propertyKey as string  ,
                asyncOptionsReader:false
            }      
            // 1. 处理装饰器参数：
            handleDecoratorOptions<OPTIONS>(decoratorContext,methodContext,options as OPTIONS,false)        
            // 2. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            defineDecoratorMetadata<OPTIONS>(decoratorContext,methodContext) 
            return descriptor            
        };         
    }  
    return decorator 
}
