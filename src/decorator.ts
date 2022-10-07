import "reflect-metadata";
import { DecoratorManager, createManagerDecorator, IDecoratorManagerHook  } from './manager';
import { getPropertyNames,isDiff,pick,isClass,firstUpperCase,isAsyncFunction,isFunction } from "./utils"
import type {ManagerDecoratorCreator,DecoratorManagerOptions}  from "./manager"
import type { Constructor} from "./types"



export type DecoratorMethodWrapperOptions<T> =T extends (DecoratorOptionsReader<T>) ? DecoratorOptionsReader<T> : T

/**
 * 函数包装器
 * 用来对原始方法进行包装并返回包装后的方法
 */
export type DecoratorMethodWrapper<T,M> = (
    (method:M ,options:T,manager?:DecoratorManager )=>M )
    | ((method:M , options:T,manager:DecoratorManager, target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>)=>M 
)



export interface DecoratorOptions {
    id?: string | number;  
    enable?: boolean
}
type TypedMethodDecorator<T> = (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;

interface DecoratorCreator<T,M,D> {
    (options?:T | D):TypedMethodDecorator<M> 
    createManager<X extends DecoratorManager,O extends DecoratorManagerOptions>(managerClass :typeof DecoratorManager,  defaultOptions?:O):ManagerDecoratorCreator<X,O>
    getManager():DecoratorManager
    destroyManager():Awaited<Promise<any>>
}

export type DecoratorManagerCreateFinalOptions = {
    autoStart?:boolean                              // 是否启动装饰器管理器，当第一次调用时会实例化管理器，如果=false，则管理器需要由开发者自行初始化并启动
    initial?:'demand' | 'once'                      // 决定什么时候实例化管理器，once=立刻实例化, demand=按需实例化, manual
    creator?:DecoratorManager | Function | typeof DecoratorManager    
}
export type DecoratorManagerCreateOptions = DecoratorManagerCreateFinalOptions | (DecoratorManager | Function | typeof DecoratorManager) | undefined

export interface createDecoratorOptions<T,M>{
    wrapper?:DecoratorMethodWrapper<T,M>
    singleton?:boolean                      // 指定方法上是否只能一个该装饰器,如果重复使用则会出错
    defaultOptionKey?:string                // 默认配置参数的字段名称,当只提供一个参数时,视为该字段值,如retry(10)=={count:10}
    autoReWrapper?: boolean                 // 当检测到装饰器参数发生变化时自动重新包装被装饰函数，以便使新的装饰器参数重新生效 
    manager?:DecoratorManagerCreateOptions
}

export interface IDecoratorOptionsReader{
    getDecoratorOptions(options:DecoratorOptions,methodName:string | symbol,decoratorName:string):Record<string,any>
}


export interface DecoratorOptionsReader<T>{
    (instance:Object): Function | undefined
}

/**
 * 为装饰器参数创建一个访问代理，用来从当前实例中读取装饰器参数
 * @param options  默认器装饰器参数
 * @returns 
 */
function getDecoratorOptionsReader<T>(options:T,methodName:string | symbol,decoratorName:string):DecoratorOptionsReader<T>{
    // this指向的是被装饰的类实例
    return function(this:any){
        const getDefaultDecoratorOptionsMethod="getDecoratorOptions"
        const getDecoratorOptionsMethodName = `get${firstUpperCase(decoratorName)}DecoratorOptions`
        try{
            if(getDecoratorOptionsMethodName in this){
                return (this as any)[getDecoratorOptionsMethodName].call(this,options,methodName,decoratorName) 
            }else if(getDefaultDecoratorOptionsMethod in this){ 
                return (this as any)[getDefaultDecoratorOptionsMethod].call(this,options,methodName,decoratorName)  
            }
        }catch(e:any){

        }        
        return options

    }
}

/**
 * 
 * 判断某个实例是否需要重置
 * 
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
function getDecoratorManager(this:any,decoratorContext:Record<string,any>,methodContext:Record<string,any>):DecoratorManager{
    let { decoratorName,createOptions:{manager: managerOptions}} = decoratorContext    
    // 1.从当前实例或类上获取装饰器管理器
    let managerInstance : DecoratorManager  = this[`${decoratorName}Manager`]
    // 2. 如果从实例或类中无法得到管理器，则
    //   - 传入的管理器实例
    //   - 根据传入的manager参数来自动创建管理器
    //   - 如果传入manager参数是一个函数，则该函数应该返回一个DecoratorManager类或实例
    // 如果autoStartManager=false，则不会创建管理器,开发者只能自己创建和启动管理器,
    // 开发者自己创建和启动管理器能更好地控制管理器实例化和启动的时机
    if(!managerInstance || !(managerInstance instanceof DecoratorManager)){
        // 如果管理器实例已经创建，则返回已经创建的实例                
        if(decoratorContext.managerInstance && (decoratorContext.managerInstance instanceof DecoratorManager)){
            managerInstance = decoratorContext.managerInstance
        }else if(managerOptions.creator instanceof DecoratorManager){
            managerInstance = managerOptions.creator
            decoratorContext.managerInstance = managerInstance // 保存起来以便下次直接使用                   
        }else if(managerOptions.creator){
            managerInstance = createDecoratorManager(decoratorName,managerOptions) as DecoratorManager
            if(managerInstance){
                decoratorContext.managerInstance = managerInstance // 保存起来以便下次直接使用                                   
            }else{
                throw new Error(`No valid <${decoratorName}> class or instance`)    
            }
        }        
    }
    if(managerInstance && (managerInstance instanceof DecoratorManager)){  
        // 将当前实例注册到管理器，以便管理器
        managerInstance.register(this)
        decoratorContext.managerInstance = managerInstance
    }
    // 如果没有提供有效的options.manager参数，则可能返回空的管理器
    return managerInstance 
}

/**
 * 通用的包装器，所有装饰器均会使用进行包装
 * @param method 
 * @returns 
 */
function useCommonDecoratorWrapper<T extends DecoratorOptions,M>(decoratorContext:Record<string,any>,methodContext:Record<string,any>,method:M){
    let { options,optionsReader,target,propertyKey,descriptor,methodName,asyncOptionsReader} = methodContext
    let {decoratorName,createOptions,defaultOptions } = decoratorContext
    let oldMethod: M =  method 
    let wrappedMethod: Function | M | undefined
    let oldOptions:T                 
    let useAsync:boolean = isAsyncFunction(oldMethod) || asyncOptionsReader
        
    // 返回包装后的方法
    function getWrappedMethod(this:any,finalOptions:Record<string,any>,manager:DecoratorManager | undefined ){
        // 触发重新对被装饰函数进行包装的条件： 
        // - autoReWrapper=true && isDiff(oldOptions,options)
        // - 调用resetMethodDecorator(this,<装饰器名称>,<id>)
        // 比较两次调用间配置是否有变更，如果不相同则自动重新包装方法，使新的参数生效
        let needReWrapper = false
        // 启用了自动重新包装
        if(createOptions?.autoReWrapper && oldOptions){  
            try{
                needReWrapper = isDiff(oldOptions,finalOptions)
            }catch(e){}                
        }
        if(!needReWrapper){
            needReWrapper = decoratorIsDirty<T>(this,decoratorName,finalOptions as T)
        }
        wrappedMethod  = methodContext.wrappedMethod
        // 包装被装饰函数
        if(!wrappedMethod || needReWrapper) {  
            // 记住包装配置参数
            if(needReWrapper || !oldOptions)  oldOptions = pick<T>(options,Object.keys(defaultOptions as any))
            wrappedMethod = methodContext.wrappedMethod = <M>createOptions.wrapper(oldMethod as M,options,manager,target,propertyKey,descriptor)                                    
        }
        return wrappedMethod
    }

    if(useAsync){
        return <M>async function(this:any){                    
            if(typeof createOptions?.wrapper=="function"){                
                // 读取装饰器参数                        
                let finalOptions = isFunction(optionsReader) ? await optionsReader.call(this,options,methodName,decoratorName) : options
                let manager:DecoratorManager | undefined 
                // 启动装饰器管理器
                manager = getDecoratorManager.call(this,decoratorContext,methodContext)
                if(manager instanceof DecoratorManager){
                    decoratorContext[`__${decoratorName}Manager__`] = manager
                    if(createOptions?.manager.autoStart){
                        try{
                            await manager.start()
                        }catch(e : any){
                            console.error(`Failed to start decoratorManager<${decoratorName}>: ${e.message}`)
                        }                        
                    }
                    if(!manager.enable){
                        return (oldMethod as Function).apply(this,arguments)
                    }
                    // 当执行时的调用
                    if("onBeforeCall" in this){
                        try{                        
                            (manager as unknown as IDecoratorManagerHook).onBeforeCall(this,methodContext,decoratorContext)
                        }catch{}
                    }
                }           
                let result = await (getWrappedMethod.call(this,finalOptions,manager) as Function).apply(this,arguments)
                if("onAfterCall" in this){
                    try{                        
                        (manager as unknown as IDecoratorManagerHook).onAfterCall(this,result,methodContext,decoratorContext)
                    }catch{}
                }
                return result
            }else{
                return (oldMethod as Function).apply(this,arguments)
            }                     
        }
    }else{
        return <M>function(this:any){                    
            if(typeof createOptions?.wrapper=="function"){                                        
                // 读取装饰器参数                        
                let finalOptions = isFunction(optionsReader) ? optionsReader.call(this,options,methodName,decoratorName) : options
                let manager:DecoratorManager | undefined 
                // 启动装饰器管理器
                manager = getDecoratorManager.call(this,decoratorContext,methodContext)
                if(manager instanceof DecoratorManager){
                    decoratorContext[`__${decoratorName}Manager__`] = manager
                    if(createOptions?.manager.autoStart){
                        manager.start().catch(e=>{
                            console.error(`Failed to start decoratorManager<${decoratorName}>: ${e.message}`)
                        })
                    }
                    if(!manager.enable){
                        return (oldMethod as Function).apply(this,arguments)
                    }                    
                }    
                return (getWrappedMethod.call(this,finalOptions,manager) as Function).apply(this,arguments)
            }else{
                return (oldMethod as Function).apply(this,arguments)
            }                     
        }
    }    
}

/**
 * 处理装饰器参数
 * @param options 
 * @param methodContext 
 */
function handleDecoratorOptions<T>(decoratorContext:Record<string,any>,methodContext:Record<string,any>,options?:T){
    let { propertyKey } = methodContext
    let {createOptions,defaultOptions, decoratorName} = decoratorContext
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
    let optionsReader:null | DecoratorOptionsReader<T> = null // 用来从当前实例读取装饰器参数的代理函数
    optionsReader = getDecoratorOptionsReader<T>(finalOptions,propertyKey,decoratorName) 
    // 注入处理后的参数
    methodContext['options'] =finalOptions
    if(optionsReader){
        methodContext['optionsReader'] = optionsReader
    }else{
        methodContext['optionsReader'] = finalOptions
    }    
}


/**
 * 在被装饰方法上定义元数据
 * 
 * getDecorators方法可以通过查找元数据来获得装饰信息
 * 
 */
function defineDecoratorMetadata<T>(decoratorContext:Record<string,any>,methodContext:Record<string,any>){
    let {target,propertyKey,optionsReader,options } = methodContext
    let {decoratorName,createOptions } = decoratorContext
    let metadataKey = `decorator:${decoratorName}`
    // 1. 读取原来的装饰元数据，当方法上同时使用了两个装饰器时会存在重复装饰器
    let oldMetadata:(DecoratorOptionsReader<T> | T)[] = Reflect.getOwnMetadata(metadataKey, (target as any),propertyKey);
    if(!oldMetadata) oldMetadata= []
    // 4.是否只允许使用一个装饰器
    if(oldMetadata.length>0 && createOptions?.singleton){
        throw new Error(`Only one decorator<${decoratorName}> can be used on method<${<string>propertyKey}>`)
    }    
    oldMetadata.push(optionsReader || options)
    Reflect.defineMetadata(metadataKey, oldMetadata,(target as any),propertyKey);
}
 

/**
 * 根据管理器参数创建管理器实例
 * @param options 
 * @returns 
 */
function createDecoratorManager(decoratorName: string,options: DecoratorManagerCreateFinalOptions): DecoratorManager | undefined {    
    if(!options) return     
    let manager, creator = options.creator
    if(typeof creator == 'function' && !isClass(creator)){
        creator = (options as Function)()
    }
    if(isClass(creator)){
        manager = new (options.creator as Constructor)(decoratorName,options)
    }else if(options.creator instanceof DecoratorManager){
        manager = options.creator
    }     
    return manager
}
/**
 * 
 * 创建装饰器
 * 
 * createMethodDecorator<参数类型>(<id>,<默认参数>,{
 *      wrapper:DecoratorMethodWrapper          // 对目标函数进行包装
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
    const managerPropName =`__${decoratorName}Manager__`
    let createOptions:createDecoratorOptions<T,M> = Object.assign({
        singleton:true,
        autoReWrapper:true,
    },opts)
    if(typeof createOptions.manager!="object"){
        createOptions.manager = {
            autoStart:true,
            initial:'demand',
            creator:createOptions.manager  
        }
    }
    createOptions.manager  = createOptions.manager as DecoratorManagerCreateFinalOptions

    // 保存装饰器上下文信息
    let decoratorContext:Record<string,any> = {
        defaultOptions,         // 装饰器默认参数
        createOptions,           // 创建装饰器的参数
        decoratorName
    }    

    // 马上创建管理器实例并启动
    if(createOptions.manager.initial=='once'){
        let manager = createDecoratorManager(decoratorName,createOptions.manager)
        if(manager && manager instanceof DecoratorManager){
            decoratorContext[managerPropName]= manager
            if(createOptions.manager.autoStart){ // 自动启动管理器
                manager.start().catch(() =>{
                    
                })
            }
        }
    } 
    // T:装饰器参数,D:装饰器默认值的类型
    function decorator(options?: T | D ):TypedMethodDecorator<M>{        
        return function(this:any,target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>):TypedPropertyDescriptor<M> | void {            
            // 当前装饰方法的上下文对象,
            let methodContext:Record<string,any> = {
                target,
                descriptor,
                methodName: propertyKey,
                asyncOptionsReader:false    
            }     
            // 检查get<decoratorName>DecoratorOptions和getDecoratorOptions是否是异步方法
            methodContext.asyncOptionsReader = 
                isAsyncFunction((target as any)[`get${firstUpperCase(decoratorName)}DecoratorOptions`]) 
                || isAsyncFunction((target as any)[`getDecoratorOptions}`]) 

            // 1. 处理装饰器参数：
            handleDecoratorOptions<T>(decoratorContext,methodContext,options as T)        
            // 2. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            defineDecoratorMetadata<T>(decoratorContext,methodContext)     

            // 3.对被装饰方法函数进行包装
            if(typeof opts?.wrapper=="function"){
                descriptor.value = useCommonDecoratorWrapper<T,M>(decoratorContext,methodContext,<M>descriptor.value)                
            }   
            return descriptor            
        };         
    }  
    // 创建装饰器管理器
    decorator.createManager = function<X extends DecoratorManager,O extends DecoratorManagerOptions>(managerClass :typeof DecoratorManager,  defaultOptions?:O):ManagerDecoratorCreator<X,O>{
        return createManagerDecorator<X,O>(decoratorContext,managerClass,defaultOptions)
    }       
    // 获取全局管理器
    decorator.getManager = function(){
        if(!(managerPropName in decoratorContext)){
            let manager = createDecoratorManager(decoratorName,createOptions.manager as DecoratorManagerCreateFinalOptions)
            if(manager && manager instanceof DecoratorManager){
                decoratorContext[managerPropName] = manager
            }
        }
        return decoratorContext[managerPropName]         
    }
    // 销毁全局管理器
    decorator.destroyManager =async function(){
        if(managerPropName in decoratorContext){
            await decoratorContext[managerPropName].stop()
            delete decoratorContext[managerPropName]
        }        
    }
    return decorator   
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