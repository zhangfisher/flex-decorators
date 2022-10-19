import "reflect-metadata";
import { DecoratorManager,IDecoratorManager, createManagerDecorator, DecoratorManagerStatus   } from './manager';
import { isDiff,pick,isClass,firstUpperCase,isAsyncFunction, setObjectDefaultValue } from "./utils"
import type {ManagerDecoratorCreator,DecoratorManagerOptions}  from "./manager"
import type { Constructor, ImplementOf, WithReturnFunction } from "./types"



export type DecoratorMethodWrapperOptions<T> =T extends (DecoratorOptionsReader<T>) ? DecoratorOptionsReader<T> : T

/**
 * 函数包装器
 * 用来对原始方法进行包装并返回包装后的方法
 */
export type DecoratorMethodWrapper<T,M> = (
    (method:M ,options:T,manager?:IDecoratorManager )=>M )
    | ((method:M , options:T,manager:IDecoratorManager, target: Object, propertyKey: string | symbol,descriptor:TypedPropertyDescriptor<M>)=>M 
)


export type DecoratorMethodContext = {
    options?:Record<string,any>          // 装饰器参数
    class:Object                        // 被装饰的目标类
    methodDescriptor:any                     //
    methodName:string                  // 被装饰的方法名称
    asyncOptionsReader:boolean         //get<decoratorName>DecoratorOptions和getDecoratorOptions是否是异步方法
    optionsReader?:Object | Function 
    [key:string]:any
}
export type DecoratorContext = {
    defaultOptions:Record<string,any>           // 装饰器默认参数
    createOptions:Record<string,any>            // 创建装饰器的参数
    decoratorName:string      
    manager?:IDecoratorManager                   // 全局管理器实例
    [key:string]:any
}

export interface DecoratorOptions {
    id?: string | number;  
    enable?: boolean                            // 是否启用或关闭装饰器
}

export type TypedMethodDecorator<T> = (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;

export interface DecoratorCreator<T,M,D> {
    (options?:T | D):TypedMethodDecorator<M> 
    createManagerDecorator<X extends IDecoratorManager,O extends DecoratorManagerOptions>(managerClass :typeof DecoratorManager,  defaultOptions?:O):ManagerDecoratorCreator<X,O>
    getManager():IDecoratorManager | undefined
    destroyManager():Awaited<Promise<any>>
}

export type DecoratorManagerCreateFinalOptions = {
    autoStart?:boolean                              // 是否启动装饰器管理器，当第一次调用时会实例化管理器，如果=false，则管理器需要由开发者自行初始化并启动
    initial?:'demand' | 'once'                      // 决定什么时候实例化管理器，once=立刻实例化, demand=按需实例化, manual
    creator?:IDecoratorManager| (ImplementOf<IDecoratorManager>)  | (typeof DecoratorManager) | WithReturnFunction<IDecoratorManager|typeof DecoratorManager| (ImplementOf<IDecoratorManager>) >    
    defaultOptions?:Record<string,any>              // 传递给管理器实例的默认构造参数
}

export type DecoratorManagerCreateOptions = DecoratorManagerCreateFinalOptions | IDecoratorManager| (ImplementOf<IDecoratorManager>)  | (typeof DecoratorManager) | WithReturnFunction<IDecoratorManager|typeof DecoratorManager| (ImplementOf<IDecoratorManager>)> | undefined

export interface createDecoratorOptions<T,M>{
    wrapper?:DecoratorMethodWrapper<T,M>
    singleton?:boolean                      // 指定方法上是否只能一个该装饰器,如果重复使用则会出错    
    defaultOptionKey?:string                // 默认配置参数的字段名称,当只提供一个参数时,视为该字段值,如retry(10)=={count:10}
    // 当装饰器的默认参数是一个{}时，传入{}就会存在岐义，比如verifyArgs的defaultOptionKey='validate"
    // 由于verifyArgs.validate可以是{},这样当使用@vertifyArgs({})时就无法区分传入的默认参数，还是完整装饰器参数，此时就需要额外进行标识
    autoReWrapper?: boolean                 // 当检测到装饰器参数发生变化时自动重新包装被装饰函数，以便使新的装饰器参数重新生效 
    manager?:DecoratorManagerCreateOptions
    asyncWrapper?: boolean | 'auto'         // 异步包装函数,auto=根据被包装函数决定来决定
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
 * 判断某个对象是否实现了IDecoratorManager接口
 * @param obj 
 */
export function isDecoratorManager(obj: any):boolean {
    let props = ["running","decoratorName","status","defaultDecoratorOptions","start","stop","register"]
    return obj && typeof(obj) == "object" &&  (obj.constructor && String(obj.constructor).startsWith('class ')) && props.every(prop =>prop in obj)
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
function getDecoratorManager(this:any,decoratorContext:DecoratorContext,methodContext:DecoratorMethodContext):IDecoratorManager{    
    let { decoratorName,createOptions:{manager: managerOptions}} = decoratorContext    
    // 1.从当前实例或类上获取装饰器管理器
    let managerInstance : IDecoratorManager  = this[`${decoratorName}Manager`]
    // 2. 如果从实例或类中无法得到管理器，则
    //   - 传入的管理器实例
    //   - 根据传入的manager参数来自动创建管理器
    //   - 如果传入manager参数是一个函数，则该函数应该返回一个DecoratorManager类或实例
    // 如果autoStart=false，则不会创建管理器,开发者只能自己创建和启动管理器,
    // 开发者自己创建和启动管理器能更好地控制管理器实例化和启动的时机
    if(!managerInstance || !isDecoratorManager(managerInstance)){
        // 如果管理器实例已经创建，则返回已经创建的实例                
        if(decoratorContext.manager && isDecoratorManager(decoratorContext.manager)){
            managerInstance = decoratorContext.manager
        }else if(isDecoratorManager(managerOptions.creator)){
            managerInstance = managerOptions.creator
            decoratorContext.manager = managerInstance // 保存起来以便下次直接使用                   
        }else if(managerOptions.creator){
            managerInstance = createDecoratorManager(decoratorName,managerOptions) as IDecoratorManager
            if(managerInstance){
                decoratorContext.manager = managerInstance // 保存起来以便下次直接使用                                   
            }else{
                throw new Error(`No valid <${decoratorName}> class or instance`)    
            }
        }        
    }
    if(managerInstance && isDecoratorManager(managerInstance)){  
        // 将当前实例注册到管理器，以便管理器
        managerInstance.register(this)
        decoratorContext.manager = managerInstance
    }
    // 如果没有提供有效的options.manager参数，则可能返回空的管理器
    return managerInstance 
}


/**
 * 执行装饰器Hook函数
 * @param this  指向被装饰的类实例
 * @param manager 
 * @param hookName 
 * @param decoratorContext 
 * @param methodContext 
 * @param args  调用参数或者执行结果[]
 */
function executeDecoratorHook(this:any,manager:IDecoratorManager,hookName:string,methodContext:DecoratorMethodContext,decoratorContext:DecoratorContext,args:any){    
    if(!isDecoratorManager(manager)) return
    // 当执行时的调用
    if(hookName in manager){
        try{                        
            (manager as any)[hookName].call(manager,this,args,methodContext,decoratorContext)
        }catch{
            // 忽略hook执行错误
        }
    }
}

/**
 * 通用的包装器，所有装饰器均会使用进行包装
 * @param method 
 * @returns 
 */
function useCommonDecoratorWrapper<T extends DecoratorOptions,M>(decoratorContext:DecoratorContext,methodContext:DecoratorMethodContext,method:M){
    let { options,optionsReader,class:target,descriptor,methodName,asyncOptionsReader} = methodContext
    let {decoratorName,createOptions,defaultOptions } = decoratorContext
    let { asyncWrapper,autoReWrapper } = createOptions
    let oldMethod: M =  method 
    let wrappedMethod: Function | M | undefined
    let oldOptions:T                 
    let useAsync:boolean =asyncWrapper=='auto' ?  (isAsyncFunction(oldMethod) || asyncOptionsReader) : asyncWrapper
        
    // 返回包装后的方法
    function getWrappedMethod(this:any,finalOptions:Record<string,any>,manager:IDecoratorManager | undefined ){
        if(finalOptions.enable===false) return oldMethod
        // 触发重新对被装饰函数进行包装的条件： 
        // - autoReWrapper=true && isDiff(oldOptions,options)
        // - 调用resetMethodDecorator(this,<装饰器名称>,<id>)
        // 比较两次调用间配置是否有变更，如果不相同则自动重新包装方法，使新的参数生效
        let needReWrapper = false
        // 启用了自动重新包装
        if(autoReWrapper && oldOptions){  
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
            if(needReWrapper || !oldOptions)  {                
                if(manager) {
                    finalOptions = Object.assign({},manager.defaultDecoratorOptions,finalOptions as Record<string,any>)
                }
                oldOptions = pick<T>(finalOptions || {},Object.keys(defaultOptions as any))
            }
            wrappedMethod = methodContext.wrappedMethod = <M>createOptions.wrapper(oldMethod as M,options,manager,target,methodName,descriptor)                                    
        }
        return wrappedMethod
    }

    function startManager(manager:IDecoratorManager){
        if(manager.running || !createOptions?.manager.autoStart) return
        return new Promise<void>((resolve,)=>{
            manager.start().then(resolve).catch((e:Error)=>{
                console.error(`Failed to start decoratorManager<${decoratorName}>: ${e.message}`)
            })
        })
    }
 
    function getFinalOptions(this:any,manager:IDecoratorManager):T{
        let finalOptions:Record<string,any> = {}
        if(typeof(optionsReader) == "function") {
            finalOptions = optionsReader.call(this,options,methodName,decoratorName) 
            if(manager && manager.defaultDecoratorOptions){
                return Object.assign({},manager.defaultDecoratorOptions ,finalOptions) as T
            }
            return finalOptions as T
        }else{
            return options as T
        }
    }

    if(useAsync){
        return <M>async function(this:any){                    
            if(typeof createOptions?.wrapper=="function"){ 
                // 启动装饰器管理器
                let manager:IDecoratorManager | undefined  = getDecoratorManager.call(this,decoratorContext,methodContext)                            
                if(isDecoratorManager(manager)){
                    if(!manager.enable) return (oldMethod as Function).apply(this,arguments)
                    await startManager(manager)
                    executeDecoratorHook.call(this,manager,"onBeforeCall",methodContext,decoratorContext,[...arguments])                
                }          
                let finalOptions = getFinalOptions.call(this,manager) 
                try{
                    let result = await (getWrappedMethod.call(this,finalOptions,manager) as Function).apply(this,arguments)
                    executeDecoratorHook.call(this,manager,"onAfterCall",methodContext,decoratorContext,result)
                    return result
                }catch(e : any){
                    executeDecoratorHook.call(this,manager,"onAfterCall",methodContext,decoratorContext,[e])
                    throw e
                }                
            }else{
                return (oldMethod as Function).apply(this,arguments)
            }                     
        }
    }else{
        return <M>function(this:any){                    
            if(typeof createOptions?.wrapper=="function"){                                        
                // 启动装饰器管理器
                let manager:IDecoratorManager | undefined  = getDecoratorManager.call(this,decoratorContext,methodContext)
                if(isDecoratorManager(manager)){
                    if(!manager.enable) return (oldMethod as Function).apply(this,arguments)
                    startManager(manager)
                    executeDecoratorHook.call(this,manager,"onBeforeCall",methodContext,decoratorContext,[...arguments])              
                }       
                let finalOptions = getFinalOptions.call(this,manager)
                try{
                    let result = (getWrappedMethod.call(this,finalOptions,manager) as Function).apply(this,arguments)
                    executeDecoratorHook.call(this,manager,"onAfterCall",methodContext,decoratorContext,result)
                    return result
                }catch(e : any){
                    executeDecoratorHook.call(this,manager,"onAfterCall",methodContext,decoratorContext,e)
                    throw e
                }     
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
function handleDecoratorOptions<T>(decoratorContext:DecoratorContext,methodContext:DecoratorMethodContext,options?:T){
    let { methodName } = methodContext
    let {createOptions,defaultOptions, decoratorName,manager} = decoratorContext
    let managerDecoratorOptions = {}  //
    if(manager){
        managerDecoratorOptions = Object.assign({},manager.defaultDecoratorOptions)
    }
    let finalOptions = Object.assign({},defaultOptions || {},managerDecoratorOptions)  

    if(typeof(options)=="object"){
        // 如果装饰器只有一个时，如果传入{}中的键与默认不一样，则视为是给默认装饰器参数赋值
        if(createOptions?.defaultOptionKey 
            && Object.keys(defaultOptions).length===1 
            && !(createOptions?.defaultOptionKey in options!)
        ){
            (finalOptions as any)[createOptions?.defaultOptionKey] = options 
        }else{
            Object.assign(finalOptions,options as T)
        }
    }else{
        if(createOptions?.defaultOptionKey && options!==undefined){
            (finalOptions as any)[createOptions?.defaultOptionKey] = options 
        }             
    }            
    if(!finalOptions.id) finalOptions.id = String(methodName) ;
    // 2. 创建代理从当前实现读取装饰器参数
    let optionsReader:null | DecoratorOptionsReader<T> = null // 用来从当前实例读取装饰器参数的代理函数
    optionsReader = getDecoratorOptionsReader<T>(finalOptions as T,methodName,decoratorName) 
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
function defineDecoratorMetadata<T>(decoratorContext:DecoratorContext,methodContext:DecoratorMethodContext){
    let {class:target,methodName,optionsReader,options } = methodContext
    let {decoratorName,createOptions } = decoratorContext
    let metadataKey = `decorator:${decoratorName}`
    // 1. 读取原来的装饰元数据，当方法上同时使用了两个装饰器时会存在重复装饰器
    let oldMetadata:(DecoratorOptionsReader<T> | T)[] = Reflect.getOwnMetadata(metadataKey, (target as any),methodName);
    if(!oldMetadata) oldMetadata= []
    // 4.是否只允许使用一个装饰器
    if(oldMetadata.length>0 && createOptions?.singleton){
        throw new Error(`Only one decorator<${decoratorName}> can be used on method<${<string>methodName}>`)
    }    
    oldMetadata.push((optionsReader || options) as (DecoratorOptionsReader<T> | T))
    Reflect.defineMetadata(metadataKey, oldMetadata,(target as any),methodName);
}
 

/**
 * 根据管理器参数创建管理器实例
 * @param managerOptions 
 * @returns 
 */
function createDecoratorManager(decoratorName: string,managerOptions: DecoratorManagerCreateFinalOptions): IDecoratorManager | undefined {    
    if(!managerOptions) return
    let manager, creator = managerOptions.creator
    if(typeof creator == 'function' && !isClass(creator)){
        creator = (managerOptions as Function)()
    }
    if(isClass(creator)){
        manager = new (managerOptions.creator as Constructor)(decoratorName,managerOptions.defaultOptions)
    }else if(isDecoratorManager(managerOptions.creator)){
        manager = managerOptions.creator
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
 *    OPTIONS: 装饰器参数
 *    METHOD: 被装饰的函数签名
 *    DEFAULT_OPTION: 默认装饰器参数值类型
 * 
 */
 
export function createDecorator<OPTIONS extends DecoratorOptions,METHOD=any,DEFAULT_OPTION=any>(decoratorName:string,defaultOptions?:OPTIONS,opts?:createDecoratorOptions<OPTIONS,METHOD>): DecoratorCreator<OPTIONS,METHOD,DEFAULT_OPTION>{
    let createOptions:createDecoratorOptions<OPTIONS,METHOD> = Object.assign({
        singleton:true,
        autoReWrapper:true,
        asyncWrapper:'auto'
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
    let decoratorContext:DecoratorContext = {
        defaultOptions:defaultOptions as Record<string,any>,         // 装饰器默认参数
        createOptions,                                                  // 创建装饰器的参数
        decoratorName,
        manager: undefined
    }    

    // 马上创建管理器实例并启动
    if(createOptions.manager.initial=='once'){
        let manager = createDecoratorManager(decoratorName,createOptions.manager)
        if(manager && isDecoratorManager(manager)){
            decoratorContext.manager = manager
            if(createOptions.manager.autoStart){ // 自动启动管理器
                manager.start().catch(() =>{ })
            }
        }
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
            // 检查get<decoratorName>DecoratorOptions和getDecoratorOptions是否是异步方法
            methodContext.asyncOptionsReader = 
                isAsyncFunction((target as any)[`get${firstUpperCase(decoratorName)}DecoratorOptions`]) 
                || isAsyncFunction((target as any)[`getDecoratorOptions}`]) 

            // 1. 处理装饰器参数：
            handleDecoratorOptions<OPTIONS>(decoratorContext,methodContext,options as OPTIONS)        
            // 2. 定义元数据, 如果多个装饰器元数据会合并后放在数组中
            defineDecoratorMetadata<OPTIONS>(decoratorContext,methodContext)     

            // 3.对被装饰方法函数进行包装
            if(typeof opts?.wrapper=="function"){
                descriptor.value = useCommonDecoratorWrapper<OPTIONS,METHOD>(decoratorContext,methodContext,<METHOD>descriptor.value)                
            }   
            return descriptor            
        };         
    }  
    // 创建装饰器管理器
    decorator.createManagerDecorator = function<MANAGER extends ImplementOf<IDecoratorManager>,OPTIONS extends DecoratorManagerOptions>(managerClass :ImplementOf<IDecoratorManager>,  defaultOptions?:OPTIONS):ManagerDecoratorCreator<MANAGER,OPTIONS>{
        return createManagerDecorator<MANAGER,OPTIONS>(decoratorContext,managerClass,defaultOptions)
    }       

    // 获取全局管理器    
    decorator.getManager = function():IDecoratorManager | undefined{
        if(!decoratorContext.manager){
            if(!createOptions.manager || (createOptions.manager && ('creator' in createOptions.manager) && !createOptions.manager.creator)){
                throw new Error(`The decorator<${decoratorName}> does not support the manager`)
            }
            let manager = createDecoratorManager(decoratorName,createOptions.manager as DecoratorManagerCreateFinalOptions)
            if(isDecoratorManager(manager)){
                decoratorContext.manager = manager
            }
        }
        return decoratorContext.manager as IDecoratorManager
    }

    // 销毁全局管理器
    decorator.destroyManager =async function(){
        if(decoratorContext.manager){
            await decoratorContext.manager.stop()
            delete decoratorContext.manager
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