import "reflect-metadata";
import { getPropertyNames } from "./utils"

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


export type GetDecoratorOptionsProxy<T> ={(instance:Object):T}
export type DecoratorMethodWrapperOptions<T> =T extends (GetDecoratorOptionsProxy<T>) ? GetDecoratorOptionsProxy<T> : T

/**
 * 函数包装器
 * 用来对原始方法进行包装并返回包装后的方法
 */
// export interface DecoratorMethodWrapper<T> {
//     (method:Function,options:GetDecoratorOptionsProxy<T>):Function 
//     (method:Function,options:DecoratorMethodWrapperOptions<T>):Function 
//     (method:Function, options:DecoratorMethodWrapperOptions<T> , target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<any>):Function
// }

export type DecoratorMethodWrapper<T> = ((method:Function,options:GetDecoratorOptionsProxy<T>)=>Function) | ((method:Function,options:T)=>Function )
    | ((method:Function, options:any , target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<any>)=>Function)


export interface DecoratorBaseOptions {
    id?: string | number; 
}

type DecoratorCreator<T> =  (options?:T)=>MethodDecorator 

export interface createMethodDecoratorOptions<T>{
    wrapper?:DecoratorMethodWrapper<T>
    proxyOptions?:boolean         // 提供配置代理对象，实现从当前实例从动态读取配置参数，当启用时，可以在当前实例getDecoratorOptions(options)
    singleton?:boolean            // 指定方法上是否只能一个该装饰器,如果重复使用则会出错
}

export interface IDecoratorOptionsAccessor{
    getDecoratorOptions(options:DecoratorBaseOptions,methodName:string | symbol,decoratorName:string):{}
}



/**
 * 为装饰器参数创建一个访问代理，用来从当前实例中读取装饰器参数
 * @param options 
 * @returns 
 */
function createMethodDecoratorOptionsProxy<T>(options:T,methodName:string | symbol,decoratorName:string):GetDecoratorOptionsProxy<T>{
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

let decoratorId = 0

/**
 * 
 * 创建装饰器
 * 
 * createMethodDecorator<参数类型>(<id>,<默认参数>,{
 *      wrapper:DecoratorMethodWrapper          // 对目标函数进行包装
 *      proxyOptions:true,                      // 创建一个代理用来访问实例的getDecoratorOptions()方法,如果需要动态读取装饰器参数时有用
 *      singleton:false,
 *      inherit:false,                          // 是否继承父类中id相同的装饰器参数
 * })
 * 
 * 
 */
 export function createMethodDecorator<T extends DecoratorBaseOptions>(name:string,defaultOptions?:T,opts?:createMethodDecoratorOptions<T>): DecoratorCreator<T>{
    return (options?:T):MethodDecorator=>{        
        return function(this:any,target: Object, propertyKey: string | symbol,descriptor:PropertyDescriptor):PropertyDescriptor{            
            // 1. 生成默认的装饰器参数
            let finalOptions:T = Object.assign({},defaultOptions || {},options)
            if(!finalOptions.id) finalOptions.id = ++decoratorId 
            
            // 2. 创建代理从当前实现读取装饰器参数
            let getOptions:null | GetDecoratorOptionsProxy<T> = null // 用来从当前实例读取装饰器参数的代理函数
            if(opts?.proxyOptions){
                getOptions = createMethodDecoratorOptionsProxy<T>(finalOptions,propertyKey,name)                
            }

            // 3. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            let metadataKey = `decorator:${name}`
            let oldMetadata:(GetDecoratorOptionsProxy<T> | T)[] = Reflect.getOwnMetadata(metadataKey, (target as any),propertyKey);
            if(!oldMetadata) oldMetadata= []
            oldMetadata.push(getOptions || finalOptions)

            // 4.是否只允许使用一个装饰器
            if(oldMetadata.length>0 && opts?.singleton){
                throw new Error(`Only one decorator<${name}> can be used on the get method<${<string>propertyKey}>`)
            }
            
            Reflect.defineMetadata(metadataKey, oldMetadata,(target as any),propertyKey);

            // 对被装饰方法函数进行包装
            if(typeof opts?.wrapper=="function"){
                let wrapperOptions =( getOptions || finalOptions) as DecoratorMethodWrapperOptions<T>
                descriptor.value = opts.wrapper(descriptor.value,wrapperOptions,target,propertyKey,descriptor)   
            }
            return descriptor            
        };    
    }    
}   


