import "reflect-metadata";
import { getPropertyNames,isDiff,pick } from "./utils"
import * as wrappers from "./wrappers"
import type { AsyncFunction } from "./types"


const excludedPropertyNames = [
    "constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","prototype",
    "toString","valueOf","toLocaleString","length"
]
type DecoratorList = {
    [decoratorName:string]:{
        [methodName:string]:any[]
    }
} 
/**
 * 获取指定装饰器的方法
 * 
 * getDecorators(<实例>,"装饰器名称")
 * 
 * @param decoratorName   装饰器名称 
 * @returns {DecoratorList}    {[装饰器名称]:{[方法名称]:[{[装饰器参数],[装饰器参数],...}]}}
 */
export function getDecorators(instance: any,decoratorName?:string,options?:{cache?:boolean}):DecoratorList | {[methodName:string]:object[]}{
    let opts = Object.assign({
        cache: true,
    },options)
    // 返回缓存中的数据
    let cache = instance.constructor.__DECORATORS__
    if(opts?.cache==undefined && cache){
        if(decoratorName && decoratorName in cache){
            return cache[decoratorName]
        }else{
            return cache as DecoratorList
        }        
    }
    let metadatas:DecoratorList = {} ;

    let propertyNames = getPropertyNames(instance)
    propertyNames.forEach(propertyName =>{
        if(excludedPropertyNames.includes(propertyName) || propertyName.startsWith("__"))  return
        if(decoratorName){
            if(!metadatas[decoratorName]) metadatas[decoratorName]={}
            let metadata =  Reflect.getMetadata(`decorator:${decoratorName}`,instance,propertyName)
            if(metadata && metadata.length>0){
                if(!(propertyName in metadatas[decoratorName])) metadatas[decoratorName][propertyName]=[]
                metadatas[decoratorName][propertyName].push(...metadata)
            }            
        }else{
            let keys = Reflect.getMetadataKeys(instance,propertyName)
            keys.forEach(key=>{
                if(key.startsWith("decorator:")){
                    const decoratorName = key.split(":")[1]
                    if(!metadatas[decoratorName]) metadatas[decoratorName]={}
                    let metadata = Reflect.getMetadata(key,instance,propertyName)
                    if(metadata && metadata.length>0){
                        if(!(propertyName in metadatas[decoratorName])) metadatas[decoratorName][propertyName]=[]
                        metadatas[decoratorName][propertyName].push(...metadata)
                    }
                }
            })
        }
 
    })    

    // 如果元数据是一个用来生成代理对象的函数则执行
    Object.values(metadatas).forEach((methodMetadatas:any) =>{
        Object.entries(methodMetadatas).forEach(([methodName,metadata])=>{
            methodMetadatas[methodName]=(metadata as []).map((opts)=>{
                if(typeof opts == "function"){
                    return (opts as Function).call(instance,instance)
                }else{
                    return opts
                }
            })            
        })
    })
    if(opts?.cache){
        instance.constructor.__DECORATORS__ = metadatas
    }

    return decoratorName ? metadatas[decoratorName] : metadatas
} 



export type DecoratorMethodWrapperOptions<T> =T extends (GetDecoratorOptions<T>) ? GetDecoratorOptions<T> : T

/**
 * 函数包装器
 * 用来对原始方法进行包装并返回包装后的方法
 */
// interface DecoratorMethodWrapper<T> {
//      (method:Function,options:DecoratorMethodWrapperOptions<T>):Function 
//      (method:Function, options:DecoratorMethodWrapperOptions<T> , target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<any>):Function
// }

export type DecoratorMethodWrapper<T,M> = (
    (method:M ,options:T)=>M )
    | ((method:M , options:any, target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>)=>M 
)


export interface MethodDecoratorOptions {
    id?: string | number;  
}
type TypedMethodDecorator<T> = (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;
type MethodDecoratorCreator<T,M,D> =  (options?:T | D)=>TypedMethodDecorator<M> 

interface createMethodDecoratorOptions<T,M >{
    wrapper?:DecoratorMethodWrapper<T,M>
    proxyOptions?:boolean                   // 提供配置代理对象，实现从当前实例从动态读取配置参数，当启用时，可以在当前实例getDecoratorOptions(options)
    singleton?:boolean                      // 指定方法上是否只能一个该装饰器,如果重复使用则会出错
    defaultOptionKey?:string                // 默认配置参数的字段名称,当只提供一个参数时,视为该字段值,如retry(10)=={count:10}
    autoReWrapper?: boolean                 // 当检测到装饰器参数发生变化时自动重新包装被装饰函数，以便使新的装饰器参数重新生效

}
export interface GetDecoratorOptions<T>{
    (instance:Object):T
}

interface IDecoratorOptionsAccessor{
    getDecoratorOptions(options:MethodDecoratorOptions,methodName:string | symbol,decoratorName:string):{}
}



/**
 * 为装饰器参数创建一个访问代理，用来从当前实例中读取装饰器参数
 * @param options 
 * @returns 
 */
function createMethodDecoratorOptionsProxy<T>(options:T,methodName:string | symbol,decoratorName:string):GetDecoratorOptions<T>{
    return function(instance:Object){
        return new Proxy(options as any,{
            get(target: object, propKey: string, receiver: any){
                let proxyOptions = target
                const DefaultDecoratorOptionsMethod="getDecoratorOptions"
                const DecoratorOptionsMethod = `get${decoratorName[0].toUpperCase() + decoratorName.substring(1)}DecoratorOptions`
                if(DecoratorOptionsMethod in instance){
                    proxyOptions =   (instance as any)[DecoratorOptionsMethod].call(instance,options,methodName)
                }else if(DefaultDecoratorOptionsMethod in instance){ 
                    proxyOptions =  (instance as IDecoratorOptionsAccessor)[DefaultDecoratorOptionsMethod].call(instance,options as any,methodName,decoratorName)                                        
                }
                return Reflect.get(proxyOptions, propKey, receiver);
            }
        })
    }
}

/**
 * 判断某个实例上
 * @param instance 
 * @param decoratorName 
 * @param decoratorOptions 
 * @returns 
 */
function decoratorIsDirty<T extends MethodDecoratorOptions>(instance:any,decoratorName:string,decoratorOptions:T):boolean{
    if(instance.__DIRTY_METHOD_DECORATORS && (decoratorName in instance.__DIRTY_METHOD_DECORATORS)){
        if(instance.__DIRTY_METHOD_DECORATORS[decoratorName].includes("*")){
            delete instance.__DIRTY_METHOD_DECORATORS[decoratorName]
            return true
        }else{
            let decoratorIds = instance.__DIRTY_METHOD_DECORATORS[decoratorName] as any[]
            let index = decoratorIds.indexOf(decoratorOptions?.id)
            if(index!==-1){
                decoratorIds.splice(index,1)                                    
                delete instance.__DIRTY_METHOD_DECORATORS[decoratorName]       
                return true
            }
        }
        if(Object.keys(instance.__DIRTY_METHOD_DECORATORS).length==0) delete instance.__DIRTY_METHOD_DECORATORS
    }
    return false
}

/**
 * 
 * 创建装饰器
 * 
 * createMethodDecorator<参数类型>(<id>,<默认参数>,{
 *      wrapper:DecoratorMethodWrapper          // 对目标函数进行包装
 *      proxyOptions:true,                      // 创建一个代理用来访问实例的getDecoratorOptions()方法,如果需要动态读取装饰器参数时有用
 *      singleton:false,
 * })
 *   
 *  泛型：
 *    T: 装饰器参数
 *    M: 被装饰的函数签名
 *    D: 默认装饰器参数值类型
 * 
 */
 
export function createMethodDecorator<T extends MethodDecoratorOptions,M=any,D=any>(name:string,defaultOptions?:T,opts?:createMethodDecoratorOptions<T,M>): MethodDecoratorCreator<T,M,D>{
    return (options?: T | D ):TypedMethodDecorator<M>=>{        
        return function(this:any,target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>):TypedPropertyDescriptor<M> | void {            
            // 1. 生成默认的装饰器参数
            let finalOptions = Object.assign({},defaultOptions)
            if(typeof(options)=="object"){
                finalOptions =Object.assign({},defaultOptions || {},options as T)
            }else{
                if(opts?.defaultOptionKey && options!==undefined){
                    (finalOptions as any)[opts?.defaultOptionKey] = options 
                }             
            }            
            if(!finalOptions.id) finalOptions.id = String(propertyKey) ;
            finalOptions = finalOptions as T
            // 2. 创建代理从当前实现读取装饰器参数
            let getOptions:null | GetDecoratorOptions<T> = null // 用来从当前实例读取装饰器参数的代理函数
            if(opts?.proxyOptions){
                getOptions = createMethodDecoratorOptionsProxy<T>(finalOptions,propertyKey,name)                
            }

            // 3. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            let metadataKey = `decorator:${name}`
            let oldMetadata:(GetDecoratorOptions<T> | T)[] = Reflect.getOwnMetadata(metadataKey, (target as any),propertyKey);
            if(!oldMetadata) oldMetadata= []
            oldMetadata.push(getOptions || finalOptions)

            // 4.是否只允许使用一个装饰器
            if(oldMetadata.length>0 && opts?.singleton){
                throw new Error(`Only one decorator<${name}> can be used on the get method<${<string>propertyKey}>`)
            }
            
            Reflect.defineMetadata(metadataKey, oldMetadata,(target as any),propertyKey);

            // 对被装饰方法函数进行包装
            if(typeof opts?.wrapper=="function"){
                let oldMethod = descriptor.value  
                let wrappedMethod: Function | M | undefined
                let oldOptions:T 
                descriptor.value = <M>function(this:any){                    
                    if(typeof opts?.wrapper=="function"){                        
                        // 读取装饰器参数
                        let options = getOptions ? getOptions(this) : finalOptions
                        // 触发重新对被装饰函数进行包装的条件： 
                        // - autoReWrapper=true && isDiff(oldOptions,options)
                        // - 调用resetMethodDecorator(this,<装饰器名称>,<id>)
                        // 比较两次调用间配置是否有变更，如果不相同则自动重新包装方法，使新的参数生效
                        let needReWrapper = false
                        // 启用了自动重新包装
                        if(opts?.autoReWrapper && oldOptions){                           
                            needReWrapper = isDiff(oldOptions,options)
                        }
                        if(!needReWrapper){
                            needReWrapper = decoratorIsDirty<T>(this,name,options)
                        }
                        // 包装被装饰函数
                        if(!wrappedMethod || needReWrapper) {  
                            if(needReWrapper || !oldOptions)  oldOptions = pick<T>(options,Object.keys(defaultOptions as any))
                            wrappedMethod =  <M>opts.wrapper(oldMethod as M,options,target,propertyKey,descriptor)                        
                        }
                        return (wrappedMethod as Function).apply(this,arguments)
                    }else{
                        return (oldMethod as Function).apply(this,arguments)
                    }                     
                }
            }
            return descriptor            
        };    
    }  

}   

/**
 * 重置装饰器方法：对被装饰方法进行重新包装
 * 
 * 当配置参数变化时，可以调用resetMethodDecorator(this,"timeout",id)来重置装饰器
 * 
 * @param instance 
 * @param decoratorId 
 */
export function resetMethodDecorator(instance:any, decoratorName:string,decoratorId?:string | number){
    if(!instance.__DIRTY_METHOD_DECORATORS) instance.__DIRTY_METHOD_DECORATORS = {}
    if(!instance.__DIRTY_METHOD_DECORATORS[decoratorName])  instance.__DIRTY_METHOD_DECORATORS[decoratorName] = []
    if(!decoratorId) decoratorId = "*"
    if(!instance.__DIRTY_METHOD_DECORATORS[decoratorName].includes(decoratorId)){
        instance.__DIRTY_METHOD_DECORATORS[decoratorName].push(decoratorId)
    }
}







