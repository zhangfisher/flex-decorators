import { TypedMethodDecorator,createDecoratorOptions, DecoratorContext,  DecoratorMethodContext, DecoratorOptions, defineDecoratorMetadata, handleDecoratorOptions} from "./decorator"

// 简化版装饰器
export type createLiteDecoratorOptions<T>  = Exclude<createDecoratorOptions<T,any>,'manager' | 'autoReWrapper' | 'wrapper'>

export interface ListDecoratorCreator<T,M,D> {
    (options?:T | D):TypedMethodDecorator<M> 
}


/**
 * 创建一个简单的装饰器，不包括管理器，仅注入一些装饰元数据，以可以通过
 * 
 * 
 * DEFAULT_OPTION  装饰器参数中的默认项类型
 * 
 * 比如options={a:nnumber,b:string}, 而其中允许b是默认参数
 * 也就是装饰器可以使用
 * @myDecorator({a,b}) 
 * 也可以使用@myDecorator(b)       简化形式时
 * 
 * 
 * 
 * 
 */
 export function createLiteDecorator<OPTIONS extends DecoratorOptions,METHOD=any,DEFAULT_OPTION=never>(decoratorName:string,defaultOptions?:OPTIONS,opts?:createLiteDecoratorOptions<OPTIONS>): ListDecoratorCreator<OPTIONS,METHOD,DEFAULT_OPTION>{
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
                methodName: propertyKey as string,
                asyncOptionsReader:false
            }      
            // 1. 处理装饰器参数：
            handleDecoratorOptions<OPTIONS>(decoratorContext,methodContext,options as OPTIONS)        
            // 2. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            defineDecoratorMetadata<OPTIONS>(decoratorContext,methodContext) 
            return descriptor            
        };         
    }  
    return decorator 
}
