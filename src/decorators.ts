import "reflect-metadata";
import { getPropertyNames,AsyncFunction } from "./utils"
import * as wrappers from "./wrappers"


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
    (method:M ,options:GetDecoratorOptions<T>)=>M ) 
    | ((method:M ,options:DecoratorMethodWrapperOptions<T>)=>M )
    | ((method:M , options:any, target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>)=>M 
)



export interface DecoratorBaseOptions {
    id?: string | number;  
}
type TypedMethodDecorator<T> = (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;
type DecoratorCreator<T,M,D> =  (options?:T | D)=>TypedMethodDecorator<M> 

interface createMethodDecoratorOptions<T,M >{
    wrapper?:DecoratorMethodWrapper<T,M>
    proxyOptions?:boolean                   // 提供配置代理对象，实现从当前实例从动态读取配置参数，当启用时，可以在当前实例getDecoratorOptions(options)
    singleton?:boolean                      // 指定方法上是否只能一个该装饰器,如果重复使用则会出错
    defaultOptionKey?:string              // 默认配置参数的字段名称,当只提供一个参数时,视为该字段值,如retry(10)=={count:10}

}

interface IDecoratorOptionsAccessor{
    getDecoratorOptions(options:DecoratorBaseOptions,methodName:string | symbol,decoratorName:string):{}
}

export interface GetDecoratorOptions<T>{
    (instance:Object):T
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
 * 
 * 创建装饰器
 * 
 * createMethodDecorator<参数类型>(<id>,<默认参数>,{
 *      wrapper:DecoratorMethodWrapper          // 对目标函数进行包装
 *      proxyOptions:true,                      // 创建一个代理用来访问实例的getDecoratorOptions()方法,如果需要动态读取装饰器参数时有用
 *      singleton:false,
 * })
 * 
 * 
 */
 
export function createMethodDecorator<T extends DecoratorBaseOptions,M=any,D=any>(name:string,defaultOptions?:T,opts?:createMethodDecoratorOptions<T,M>): DecoratorCreator<T,M,D>{
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
                descriptor.value = opts.wrapper(descriptor.value as M,getOptions || finalOptions,target,propertyKey,descriptor)   
            }
            return descriptor            
        };    
    }    
}   


// ------------------------ TIMEOUT ------------------------ 
export interface TimeoutOptions extends DecoratorBaseOptions {
    value?  : number,                   // 超时时间
    default?: any                       // 如果提供则返回该默认值而不是触发错误
}
export const timeout = createMethodDecorator<TimeoutOptions,AsyncFunction,number>("timeout",{value:0},{
    wrapper: function(method:AsyncFunction,getOptions:GetDecoratorOptions<TimeoutOptions>):AsyncFunction{
        return async function(this:any){
            const options = getOptions(this)
            return await wrappers.timeout(method,options).call(this,...arguments)
        }        
    },
    proxyOptions:true,
    defaultOptionKey:"value"
})
export interface IGetTimeoutDecoratorOptions {
    getTimeoutDecoratorOptions(options:TimeoutOptions,methodName:string | symbol,decoratorName:string):TimeoutOptions
}

// ------------------------ RETRY ------------------------ 
export interface RetryOptions extends DecoratorBaseOptions {
    count?   : number              // 重试次数
    interval?: number            //重试间隔
    default? : any                // 失败时返回的默认值
}
export const retry = createMethodDecorator<RetryOptions>("retry",{count:1,interval:0},{
    wrapper: function(method:Function,getOptions:GetDecoratorOptions<RetryOptions>):Function{
        return function(this:any){
            const options = getOptions(this)
            return wrappers.retry(method,options).call(this,...arguments)
        }        
    },
    proxyOptions:true,
    defaultOptionKey:"count"
})
export interface IGetRetryDecoratorOptions {
    getRetryDecoratorOptions(options:RetryOptions,methodName:string | symbol,decoratorName:string):RetryOptions
}

// ------------------------ noReentry ------------------------ 
export interface NoReentryOptions extends DecoratorBaseOptions { 
    silence?:boolean                      // 默认true,当重入时默默地返回,=false时会触发错误
}
export const noReentry = createMethodDecorator<NoReentryOptions>("noReentry",{silence:true},{
    wrapper: function(method:Function,getOptions:GetDecoratorOptions<NoReentryOptions>):Function{
        let noReentryMethod :Function
        return function(this:any){ 
            const options = getOptions(this)
            if(!noReentryMethod) noReentryMethod= wrappers.noReentry(method,options)
            return noReentryMethod.apply(this,arguments)
        }        
    },
    proxyOptions:true,
    defaultOptionKey:"silence"
})
export interface IGetNoReentryDecoratorOptions {
    getRetryDecoratorOptions(options:NoReentryOptions,methodName:string | symbol,decoratorName:string):NoReentryOptions
}

// ------------------------ throttle ------------------------ 
export interface ThrottleOptions extends DecoratorBaseOptions { 
    interval:number,
    noLeading?:boolean,
    noTrailing?:boolean,
    debounceMode?: boolean
}
export const throttle = createMethodDecorator<ThrottleOptions>("throttle",{interval:1000,noTrailing:false},{
    wrapper: function(method:AsyncFunction,getOptions:GetDecoratorOptions<ThrottleOptions>):Function{
        return function(this:any){ 
            const options = getOptions(this) 
            return wrappers.throttle(method,options).call(this,...arguments)
        }        
    },
    proxyOptions:true,
    defaultOptionKey:"interval"
})

export interface IGetThrottleDecoratorOptions {
    getThrottleDecoratorOptions(options:ThrottleOptions,methodName:string | symbol,decoratorName:string):ThrottleOptions
}

// ------------------------ debounce ------------------------ 


export interface DebounceOptions extends DecoratorBaseOptions { 
    interval:number, 
    atBegin?:boolean
}
export const debounce = createMethodDecorator<DebounceOptions>("debounce",{interval:1000,atBegin:true},{
    wrapper: function(method:AsyncFunction,getOptions:GetDecoratorOptions<DebounceOptions>):Function{
        let debounceMethod :Function
        return function(this:any){ 
            const options = getOptions(this) 
            if(!debounceMethod) debounceMethod = wrappers.debounce(method,options)
            return debounceMethod.call(this,...arguments)
        }        
    },
    proxyOptions:true,
    defaultOptionKey:"interval"
})

export interface IGetDebounceDecoratorOptions {
    getDebounceDecoratorOptions(options:DebounceOptions,methodName:string | symbol,decoratorName:string):DebounceOptions
}
