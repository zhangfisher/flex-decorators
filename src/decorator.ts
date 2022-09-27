import "reflect-metadata";
import { DecoratorManager } from "./manager";
import { getPropertyNames,isDiff,pick,isClass,hasOwnProperty,firstUpperCase } from "./utils"
 
const excludedPropertyNames = [
    "constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","prototype",
    "toString","valueOf","toLocaleString","length"
]


/**
 * getDecorators返回的当前实例的装饰器信息
 * {[装饰器名称]:{
 *      [方法名称]:[<装饰器参数>,<装饰器参数>,<装饰器参数代理>]
 * }}
 */
type DecoratorList = {
    [decoratorName:string]:{[methodName:string]:any[]} 
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
    if(decoratorName){
        metadatas = metadatas as DecoratorList
    }else{
        metadatas = metadatas as DecoratorList
    }

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
    (method:M ,options:T,manager?:DecoratorManager )=>M )
    | ((method:M , options:any,manager:DecoratorManager, target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>)=>M 
)



export interface DecoratorOptions {
    id?: string | number;  
    enable?: boolean
}
type TypedMethodDecorator<T> = (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;
type DecoratorCreator<T,M,D> =  (options?:T | D)=>TypedMethodDecorator<M> 

interface createDecoratorOptions<T,M>{
    wrapper?:DecoratorMethodWrapper<T,M>
    proxyOptions?:boolean                   // 提供配置代理对象，实现从当前实例从动态读取配置参数，当启用时，可以在当前实例getDecoratorOptions(options)
    singleton?:boolean                      // 指定方法上是否只能一个该装饰器,如果重复使用则会出错
    defaultOptionKey?:string                // 默认配置参数的字段名称,当只提供一个参数时,视为该字段值,如retry(10)=={count:10}
    autoReWrapper?: boolean                 // 当检测到装饰器参数发生变化时自动重新包装被装饰函数，以便使新的装饰器参数重新生效
    // 是否启动装饰器管理器，当第一次调用时会实例化管理器，如果=false，则管理器需要由开发者自行初始化并启动
    autoStartManager?:boolean              
    // 装饰器管理器，取值可以中一个DecoratorManager类，或者DecoratorManager实例，或者返回DecoratorManager实例和类的函数
    manager?:DecoratorManager | Function | typeof DecoratorManager
}
export interface GetDecoratorOptions<T>{
    (instance:Object):T
}

interface IDecoratorOptionsAccessor{
    getDecoratorOptions(options:DecoratorOptions,methodName:string | symbol,decoratorName:string):{}
}



/**
 * 为装饰器参数创建一个访问代理，用来从当前实例中读取装饰器参数
 * @param options 
 * @returns 
 */
function createDecoratorOptionsProxy<T>(options:T,methodName:string | symbol,decoratorName:string):GetDecoratorOptions<T>{
    return function(instance:Object){
        return new Proxy(options as any,{
            get(target: object, propKey: string, receiver: any){
                let proxyOptions = target
                const getDefaultDecoratorOptionsMethod="getDecoratorOptions"
                const getDecoratorOptionsMethodName = `get${firstUpperCase(decoratorName)}DecoratorOptions`
                if(getDecoratorOptionsMethodName in instance){
                    proxyOptions =   (instance as any)[getDecoratorOptionsMethodName].call(instance,options,methodName)
                }else if(getDefaultDecoratorOptionsMethod in instance){ 
                    proxyOptions =  (instance as IDecoratorOptionsAccessor)[getDefaultDecoratorOptionsMethod].call(instance,options as any,methodName,decoratorName)                                        
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
function decoratorIsDirty<T extends DecoratorOptions>(instance:any,decoratorName:string,decoratorOptions:T):boolean{
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
 * 获取装饰器管理器
 *  
 */
async function getDecoratorManager(this:any,context:Record<string,any>):Promise<DecoratorManager> {
    let { decoratorName,createOptions} = context
    let { autoStartManager,manager:managerParam } = createOptions

    
    // 1.从当前实例或类上获取装饰器管理器
    let managerInstance : DecoratorManager = this[`get${firstUpperCase(decoratorName)}Manager`]  

    // 2. 如果从实例或类中无法得到管理器，则
    //   - 传入的管理器实例
    //   - 根据传入的manager参数来自动创建管理器
    //   - 如果传入manager参数是一个函数，则该函数应该返回一个DecoratorManager类或实例
    // 如果autoStartManager=false，则不会创建管理器,开发者只能自己创建和启动管理器,
    // 开发者自己创建和启动管理器能更好地控制管理器实例化和启动的时机
    if(!managerInstance || !(managerInstance instanceof DecoratorManager)){
        // 如果管理器实例已经创建，则返回已经创建的实例                
        if(context.managerInstance && (context.managerInstance instanceof DecoratorManager)){
            managerInstance = context.managerInstance
        }else if(managerParam  instanceof DecoratorManager){
            managerInstance = managerParam
            context.managerInstance = managerInstance // 保存起来以便下次直接使用                   
        }else if(autoStartManager && managerParam){
            let managerClassOrInstance = isClass(managerParam) ? managerParam : (managerParam as Function).call(this)  
            if(managerClassOrInstance){
                if(managerClassOrInstance instanceof DecoratorManager){
                    managerInstance = managerClassOrInstance
                }else{
                    managerInstance =new managerClassOrInstance(decoratorName)             
                }
                context.managerInstance = managerInstance // 保存起来以便下次直接使用                                   
            }else{
                throw new Error(`No valid <${decoratorName}> class or instance`)    
            }
        }        
    }
    // 3. 启动管理器
    if(managerInstance && (managerInstance instanceof DecoratorManager)){  
        // 将当前实例注册到管理器，以便管理器
        managerInstance.register(this)
        if(!managerInstance.running){
            try{
                await managerInstance.start()    
            }catch(e:any){
                throw new Error(`Unable to start <${decoratorName}> decoratorManager`)
            }
        }
        context.managerInstance = managerInstance
    }
    // 如果没有提供有效的options.manager参数，则可能返回空的管理器
    return managerInstance
}

/**
 * 通用的包装器，所有装饰器均会使用进行包装
 * @param method 
 * @returns 
 */
function useCommonDecoratorWrapper<T extends DecoratorOptions,M>(context:Record<string,any>,method:M){
    let { options,getOptions,decoratorName,createOptions,target,propertyKey,descriptor,defaultOptions } = context
    let oldMethod: M =  method 
    let wrappedMethod: Function | M | undefined
    let oldOptions:T                 
    return <M>async function(this:any){                    
        if(typeof createOptions?.wrapper=="function"){                        

            // 读取装饰器参数                        
            let finalOptions = getOptions ? await getOptions.call(this,this) : options
            let manager:DecoratorManager | undefined 
            // 启动装饰器管理器
            try{
                manager = await getDecoratorManager.call(this,context)
                if(!manager.enable){
                    return (oldMethod as Function).apply(this,arguments)
                }
            }catch(err){

            }            

            // 触发重新对被装饰函数进行包装的条件： 
            // - autoReWrapper=true && isDiff(oldOptions,options)
            // - 调用resetMethodDecorator(this,<装饰器名称>,<id>)
            // 比较两次调用间配置是否有变更，如果不相同则自动重新包装方法，使新的参数生效
            let needReWrapper = false
            // 启用了自动重新包装
            if(createOptions?.autoReWrapper && oldOptions){                           
                needReWrapper = isDiff(oldOptions,finalOptions)
            }
            if(!needReWrapper){
                needReWrapper = decoratorIsDirty<T>(this,decoratorName,finalOptions)
            }
            // 包装被装饰函数
            if(!wrappedMethod || needReWrapper) {  
                if(needReWrapper || !oldOptions)  oldOptions = pick<T>(options,Object.keys(defaultOptions as any))
                wrappedMethod =  <M>createOptions.wrapper(oldMethod as M,options,manager,target,propertyKey,descriptor)                        
            }
            return (wrappedMethod as Function).apply(this,arguments)
        }else{
            return (oldMethod as Function).apply(this,arguments)
        }                     
    }
}

/**
 * 处理装饰器参数
 * @param options 
 * @param context 
 */
function handleDecoratorOptions<T>(context:Record<string,any>,options?:T){
    let {decoratorName,createOptions,propertyKey,defaultOptions } = context
    let finalOptions = Object.assign({},defaultOptions || {})
    if(typeof(options)=="object"){
        Object.assign(finalOptions,options as T)
    }else{
        if(createOptions?.defaultOptionKey && options!==undefined){
            (finalOptions as any)[createOptions?.defaultOptionKey] = options 
        }             
    }            
    if(!finalOptions.id) finalOptions.id = String(propertyKey) ;
    finalOptions = finalOptions as T    
    // 2. 创建代理从当前实现读取装饰器参数
    let getOptions:null | GetDecoratorOptions<T> = null // 用来从当前实例读取装饰器参数的代理函数
    if(createOptions?.proxyOptions){
        getOptions = createDecoratorOptionsProxy<T>(finalOptions,propertyKey,decoratorName)                
    }
    // 注入处理后的参数
    context['options'] =finalOptions
    context['getOptions'] = getOptions
}


/**
 * 在被装饰方法上定义元数据
 * 
 * getDecorators方法可以通过查找元数据来获得装饰信息
 * 
 */
function defineDecoratorMetadata<T>(context:Record<string,any>,){
    let {decoratorName,target,createOptions,propertyKey,getOptions,options } = context
    let metadataKey = `decorator:${decoratorName}`
    // 1. 读取原来的装饰元数据，当方法上同时使用了两个装饰器时会存在重复装饰器
    let oldMetadata:(GetDecoratorOptions<T> | T)[] = Reflect.getOwnMetadata(metadataKey, (target as any),propertyKey);
    if(!oldMetadata) oldMetadata= []
    // 4.是否只允许使用一个装饰器
    if(oldMetadata.length>0 && createOptions?.singleton){
        throw new Error(`Only one decorator<${decoratorName}> can be used on method<${<string>propertyKey}>`)
    }    
    oldMetadata.push(getOptions || options)
    Reflect.defineMetadata(metadataKey, oldMetadata,(target as any),propertyKey);
}


export interface DecoratorManagerOptions{
    enable:boolean                                  // 是否启用/禁用装饰器
    scope?: 'class' | 'instance' | 'global'         // 管理器作用域
}


type Constructor = { new (...args: any[]): any };
type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void;


/**
 * 在指定的类上面定义一个`${firstUpperCase(decoratorName)}Manager`的属性用来访问管理器装饰器

   T: 管理器类
   O: 管理器装饰器的参数
 * 
 * @param context 
 * @param targetClass 
 * @param decoratorName 
 * @param managerClass 管理器类对象
 * @param options      管理器装饰器的参数
 */
function defineDecoratorManagerProperty<T extends Constructor,O extends DecoratorManagerOptions>(context:Record<string,any>,targetClass:T,decoratorName:string,managerClass :typeof DecoratorManager,options:O){
    const managerPropName = `${firstUpperCase(decoratorName)}Manager`
    const managerInstancePropName = `__${decoratorName}ManagerInstance__`
    Object.defineProperty(targetClass.prototype,managerPropName,
        {
            get: function() { 
                const scope =  options.scope == 'class' ? this.constructor : (options.scope == 'instance' ?  this : context)
                if(!hasOwnProperty(scope,managerInstancePropName)){
                    scope[managerInstancePropName]  = new managerClass(decoratorName,options)
                    scope[managerInstancePropName].register(this)
                } 
                return scope[managerInstancePropName]    
            }
        }
    )     
}


/**
 * 
 * 创建管理器装饰器
 * 
 *  该装饰器会在被装饰的类原型上生成一个${decoratorName}Manager的属性用来获取管理器实例
 *  通过该属性可以读取到当前类指定装饰器的所有信息
 * 
 * 管理器实例会自动创建保存在实例或者类静态变量上__${decoratorName}ManagerInstance__
 * 
 * 
 * 
 *  @cacheScope({
 *      enable:<true/false>                  // 是否启用/禁用装饰器功能,只会调用原始方法而不会调用装饰器提供的功能
 *      scope:"class"                        // 取值class,instance,global
 * })
 *  T: 管理器类
 *  O: 管理器类配置参数类型
 */
function createManagerDecorator<T extends DecoratorManager,O extends DecoratorManagerOptions>(context:Record<string,any>, decoratorName:string,managerClass :typeof DecoratorManager,  defaultOptions?:O){
    return (options?: O):TypedClassDecorator<T>=>{
        let finalOptions = Object.assign({scope:"instance",enable:true},defaultOptions,options)
        return function<T extends Constructor>(this:any,targetClass: T){  
            // 在目标类上定义一个`${decoratorName}Manager的属性
            defineDecoratorManagerProperty<T,O>(
                context,
                targetClass,                
                decoratorName,
                managerClass,
                finalOptions
            )
        }
    }    
 }


/**
 * 为类注入一个访问装饰器管理器的变量
 */
function createManagerInjector<T extends DecoratorManagerOptions>(options:T){
    
    
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
 
export function createDecorator<T extends DecoratorOptions,M=any,D=any>(decoratorName:string,defaultOptions?:T,opts?:createDecoratorOptions<T,M>): DecoratorCreator<T,M,D>{
    let createOptions = Object.assign({
        singleton:true,
        autoReWrapper:true,
        autoStartManager:true
    },opts)
    return (options?: T | D ):TypedMethodDecorator<M>=>{        
        let context:Record<string,any> ={}
        function decorator(this:any,target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>):TypedPropertyDescriptor<M> | void {            
            // 定义一个上下对对象以便于传递
            context = {
                target,
                propertyKey,
                descriptor,
                defaultOptions,
                createOptions,
                decoratorName
            }
            // 1. 处理装饰器参数：
            handleDecoratorOptions<T | D>(context,options)        

            // 2. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            defineDecoratorMetadata<T>(context)     

            // 3.对被装饰方法函数进行包装
            if(typeof opts?.wrapper=="function"){
                descriptor.value = useCommonDecoratorWrapper<T,M>(context,<M>descriptor.value)                
            }   
            return descriptor            
        }; 
        
        // 创建装饰器管理器
        decorator.createManagerDecorator = function<T extends DecoratorManager,O extends DecoratorManagerOptions>(managerClass :typeof DecoratorManager,  defaultOptions?:O){
            return createManagerDecorator(context,decoratorName,managerClass,defaultOptions)
        }      

        
        return decorator
    }  
}   

/**
 * 重置装饰器方法：对被装饰方法进行重新包装
 * 
 * 当配置参数变化时，可以调用resetMethodDecorator(this,"timeout",id)来重置装饰器
 * 工作原理是：
 *   将要重置的装饰器id或名称放置到当前实例上的__DIRTY_METHOD_DECORATORS，然后
 *   当执行被装饰函数时，会检查其是否已经在__DIRTY_METHOD_DECORATORS中，如果在则重新读取配置
 *   参数对被装饰函数进行重新包装
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