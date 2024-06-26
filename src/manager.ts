/**
 * 装饰器管理器
 */

import { hasOwnProperty } from "./utils";
import { isPlainObject } from "flex-tools/typecheck/isPlainObject"
import { asyncSignal } from "flex-tools/async/asyncSignal"
import { getPropertyNames  } from "flex-tools/object/getPropertyNames"
import type { IAsyncSignal,AllowEmpty,Constructor, ImplementOf} from "flex-tools"; 
import { DecoratorContext, DecoratorMethodContext, DecoratorOptions } from "./decorator";
import { TypedClassDecorator } from "./types";

/**
 * getDecorators返回的当前实例的装饰器信息
 * {[装饰器名称]:{
 *      [方法名称]:[<装饰器参数>,<装饰器参数>,<装饰器参数代理>]
 * }}
 */
export type DecoratorList = {
    [decoratorName:string]:{[methodName:string]:any[]} 
} 

export type DecoratedMethodList<T extends DecoratorOptions=DecoratorOptions> = {
    [methodName:string]:T[]
}


const excludedPropertyNames = [
    "constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","prototype",
    "toString","valueOf","toLocaleString","length"
]

/**
 * 获取指定装饰器的方法
 * 
 * getDecorators(<实例>,"装饰器名称")
 * 
 * @param decoratorName   装饰器名称 
 * @returns {DecoratorList}    {[装饰器名称]:{[方法名称]:[{[装饰器参数],[装饰器参数],...}]}}
 */
export function getDecorators<T extends DecoratorOptions=DecoratorOptions>(instance: any,decoratorName?:string,options?:{cache?:boolean}):DecoratorList | DecoratedMethodList<T>{
    let opts = Object.assign({
        cache: true,
    },options)
    // 返回缓存中的数据
    let cache = instance.constructor.__DECORATORS__
    if(opts?.cache && isPlainObject(cache) && Object.keys(cache).length>0){
        if(decoratorName){
            if(decoratorName in cache){
                return cache[decoratorName]
            }
        }else{
            return cache
        }
    }
    let metadatas:DecoratorList | DecoratedMethodList = {} ;

    let propertyNames = getPropertyNames(instance)
    propertyNames.forEach(propertyName =>{
        if(excludedPropertyNames.includes(propertyName) || propertyName.startsWith("__"))  return
        if(decoratorName){
            if(!metadatas[decoratorName]) metadatas[decoratorName]={}
            let metadata =  Reflect.getMetadata(`decorator:${decoratorName}`,instance,propertyName)
            if(metadata && metadata.length>0){
                if(!(propertyName in metadatas[decoratorName])) (metadatas[decoratorName] as DecoratedMethodList)[propertyName]=[];
                (metadatas[decoratorName] as DecoratedMethodList)[propertyName].push(...metadata)
            }            
        }else{
            let keys = Reflect.getMetadataKeys(instance,propertyName)
            keys.forEach(key=>{
                if(key.startsWith("decorator:")){
                    const decoratorName = key.split(":")[1]
                    if(!metadatas[decoratorName]) metadatas[decoratorName]={}
                    let metadata = Reflect.getMetadata(key,instance,propertyName)
                    if(metadata && metadata.length>0){
                        if(!(propertyName in metadatas[decoratorName])) (metadatas as DecoratorList)[decoratorName][propertyName]=[];
                        (metadatas as DecoratorList)[decoratorName][propertyName].push(...metadata)
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
    // 仅当没有提供装饰器名称时才进行缓存
    if(opts?.cache && !decoratorName){
        instance.constructor.__DECORATORS__ = metadatas
    }

    return decoratorName ? (metadatas[decoratorName]  as DecoratedMethodList<T>): (metadatas as DecoratorList)
} 

export interface DecoratorManagerOptions{
    enable?:boolean                                     // 是否启用/禁用装饰器，对作用域下的所有装饰器起作用
    scope?: 'class' | 'instance' | 'global'             // 管理器作用域
    defaultDecoratorOptions?:Record<string,any>         // 装饰器默认参数，可以为作用域内装饰器提供通用参数
}

/**
 * 返回当前实例是否有指定装饰器装饰的方法
 * 
 * hasDecorator(<实例>,"装饰器名称")
 * 
 * @param instance 
 * @param decoratorName 
 * @returns 
 */
export function hasDecorator(instance:any,decoratorName:string):boolean{
     // 返回缓存中的数据
    let cache = instance.constructor.__DECORATORS__
    if(cache && decoratorName && (decoratorName in cache)){
        return true
    } 
    let propertyNames = getPropertyNames(instance)
    for(let name of propertyNames){    
        let metadata =  Reflect.getMetadata(`decorator:${decoratorName}`,instance,name)
        if(metadata && metadata.length>0){
            return true
        }   
    }
    return false
}

/**
 * 管理器的状态
 */
export enum DecoratorManagerStatus {
    INITIAL      = 0,                           // 未初始化
    STARTING     = 4,                           // 正在启动
    RUNNING      = 5,                           // 运行状态
    STOPPING     = 6,                           // 正在停止
    STOPPED      = 7,                           // 已停止
    ERROR        = 9                            // ERROR
}


/**
 * 当调用被装饰的方法时的回调
 */
export interface IDecoratorManagerHook {    
    onBeforeCall(instance:object,args:any[],methodContext:DecoratorMethodContext,decoratorContext:DecoratorContext):void
    onAfterCall(instance:object,returns:any,methodContext:DecoratorMethodContext,decoratorContext:DecoratorContext):void
}

export interface IDecoratorManager{
    get running(): boolean
    get enable(): boolean
    get decoratorName():string
    get status():DecoratorManagerStatus 
    get defaultDecoratorOptions():Record<string,any>
    start(timeout?:number):Awaited<Promise<any>> 
    stop(timeout?:number):Awaited<Promise<any>> 
    register(instance:IDecoratorManager):void
}

/**
 * 装饰器管理器基类
 */
export class DecoratorManager implements IDecoratorManager{    
    #decoratorName:string = ""                                              // 装饰器名称
    #options:DecoratorManagerOptions 
    #status: DecoratorManagerStatus = DecoratorManagerStatus.INITIAL        // 状态
    #instances:any[] = []                                                   // 保存装饰实例引用 
    #runningSignal:AllowEmpty<IAsyncSignal>
    #stopingSignal:AllowEmpty<IAsyncSignal>
    constructor(decoratorName:string,options:DecoratorManagerOptions){
        this.#decoratorName=decoratorName
        this.#options = Object.assign({
            enable:true,
            scope:'global',
            defaultDecoratorOptions:{}
        },options)    
    }    
    get options():DecoratorManagerOptions{ return this.#options}
    get enable():boolean{ return this.#options.enable==undefined ? true : this.#options.enable  }
    set enable(value:boolean){ this.#options.enable =value }
    get decoratorName():string { return this.#decoratorName }
    get status():DecoratorManagerStatus { return this.#status }
    get running(): boolean { return this.#status==DecoratorManagerStatus.RUNNING  } 
    get defaultDecoratorOptions():Record<string,any> { return this.#options.defaultDecoratorOptions as Record<string,any> }
    
    /**
     * 启动管理器，并且等待启动完成
     */
    async start(timeout?:number) {
        if(this.#status==DecoratorManagerStatus.RUNNING) return
        // 如果正处于启动中，则等待
        if(this.#status == DecoratorManagerStatus.STARTING && this.#runningSignal){
            return await this.#runningSignal(timeout)
        }
        if(![DecoratorManagerStatus.INITIAL,DecoratorManagerStatus.STOPPED,DecoratorManagerStatus.ERROR].includes(this.#status)){
            throw new Error(`Unload start <${this.#decoratorName}> decoratorManager`)
        }
        try{
            this.#status = DecoratorManagerStatus.STARTING            
            this.#runningSignal = asyncSignal()
            await this.onStart()
            this.#status = DecoratorManagerStatus.RUNNING
            this.#runningSignal.resolve()
        }catch(e:any){
            this.#status = DecoratorManagerStatus.ERROR;
            if(this.#runningSignal) this.#runningSignal.reject(e)
        }finally{
            this.#runningSignal = null
        }        
    }    
    /**
    * 由子类继承用来实现具体的启动逻辑
    * @param args 
    */
    async onStart(){
        //throw new Error("Method not implemented.");
    } 
    async stop(timeout?:number) {
        if([DecoratorManagerStatus.ERROR,DecoratorManagerStatus.INITIAL,DecoratorManagerStatus.STOPPED].includes(this.#status)) return

        // 如果正在停止则等待
        if(this.#status == DecoratorManagerStatus.STOPPING && this.#stopingSignal){
            return await this.#stopingSignal(timeout)
        }       

        try{
            this.#status = DecoratorManagerStatus.STOPPING            
            this.#stopingSignal = asyncSignal()
            await this.onStop()
            this.#status = DecoratorManagerStatus.STOPPED
            this.#stopingSignal.resolve()
        }catch(e:any){
            this.#status = DecoratorManagerStatus.ERROR;
            if(this.#stopingSignal) this.#stopingSignal.reject(e)
        }finally{
            this.#stopingSignal = null
        }     
    }    
    async onStop(){
        //throw new Error("Method not implemented.");
    }    
    /**
     * 将使用装饰器的实例注册到管理器中
     * @param instance 
     */
    register(instance:IDecoratorManager){
        if(!this.#instances.includes(instance)) this.#instances.push(instance)
    }
    /**
     * 获取被装饰的方法列表
     */
    getMethods(instance?:object):DecoratorList | DecoratedMethodList{
        if(this.#instances.length==1){
            return getDecorators(this.#instances[0],this.#decoratorName) as DecoratedMethodList
        }else if(instance) {
            return getDecorators(instance,this.#decoratorName) as DecoratorList
        }else{
            return {}
        }
    }
} 


/**
 * 在指定的类上面定义一个`${firstUpperCase(decoratorName)}Manager`的属性用来访问管理器装饰器

   T: 管理器类
   O: 管理器装饰器的参数
 * 
 * @param decoratorContext   
 * @param targetClass 
 * @param decoratorName 
 * @param managerClass 管理器类对象
 * @param options      管理器装饰器的参数
 */
function defineDecoratorManagerProperty<T extends Constructor,O extends DecoratorManagerOptions>(decoratorContext:Record<string,any>,targetClass:T,managerClass :ImplementOf<IDecoratorManager>,options:O){
    const { decoratorName }= decoratorContext
    const managerPropName = `${decoratorName}Manager`
    const managerInstancePropName = `__${decoratorName}Manager__`
    Reflect.defineProperty(targetClass.prototype,managerPropName,
        {
            get: function() { 
                const scope =  options.scope == 'class' ? this.constructor : (options.scope == 'instance' ?  this : decoratorContext)
                if(!hasOwnProperty(scope,managerInstancePropName)){
                    scope[managerInstancePropName]  = new managerClass(decoratorName,options)
                    scope[managerInstancePropName].register(this)
                } 
                return scope[managerInstancePropName]    
            }
        }
    )     
}

export interface ManagerDecoratorCreator<T,O extends DecoratorManagerOptions>{ 
    (options?: O):TypedClassDecorator<T>
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
 export function createManagerDecorator<T,O extends DecoratorManagerOptions>(decoratorContext:DecoratorContext, managerClass :ImplementOf<IDecoratorManager>,  defaultOptions?:O):ManagerDecoratorCreator<T,O>{
    return (options?: O):TypedClassDecorator<T>=>{
        return function<T extends Constructor>(this:any,targetClass: T){  
            let finalOptions = Object.assign({scope:'global'},defaultOptions,options || {})
            // 在目标类上定义一个`${decoratorName}Manager的属性
            defineDecoratorManagerProperty<T,O>(
                decoratorContext,
                targetClass,                
                managerClass,
                finalOptions
            )
        }
    }    
}
 