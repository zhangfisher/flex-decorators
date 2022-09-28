/**
 * 装饰器管理器
 */

import { getDecorators, createDecorator } from './decorator';
import { hasOwnProperty,firstUpperCase } from "./utils";
import { asyncSignal, IAsyncSignal } from "./asyncSignal"
import type { AllowNull,TypedClassDecorator, Constructor} from "./types";

interface DecoratorList{
    [methodName: string]: {
        
    }[]
}

type DecoratorManageMode = 'none' | 'auto' | 'manual'


interface IDecoratorManager{
    get running(): boolean         
    onStart(...args: any[]):Awaited<Promise<any>>
    onStop(...args: any[]): Awaited<Promise<any>>
    start(timeout?:number): Awaited<Promise<any>>
    stop(): Awaited<Promise<any>>
}

export interface DecoratorManagerOptions{
    enable?:boolean                                     // 是否启用/禁用装饰器
    scope?: 'class' | 'instance' | 'global'             // 管理器作用域

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
 * 装饰器管理器基类
 */
export class DecoratorManager implements IDecoratorManager{    
    #decoratorName:string = ""                                              // 装饰器名称
    #options:Record<string,any>  
    #status: DecoratorManagerStatus = DecoratorManagerStatus.INITIAL        // 状态
    #instances:any[] = []                                                   // 保存装饰实例引用 
    #runningSignal:AllowNull<IAsyncSignal>
    constructor(decoratorName:string,options:Record<string,any>){
        this.#decoratorName=decoratorName
        this.#options = Object.assign({
            enable:true
        },options)
    
    }    
    get enable():boolean{ return this.#options.enable  }
    set enable(value:boolean){ this.#options.enable =value }
    get decoratorName():string { return this.#decoratorName }
    get status():DecoratorManagerStatus { return this.#status }
    get running(): boolean { return this.#status==DecoratorManagerStatus.RUNNING  } 
    
    /**
     * 启动管理器，并且等待启动完成
     */
    async start(timeout?:number) {
        if(this.#status==DecoratorManagerStatus.RUNNING) return
        // 如果正处于启动中，则等待
        if(this.#status == DecoratorManagerStatus.STARTING && this.#runningSignal){
            return await this.#runningSignal(timeout)
        }
        if(![DecoratorManagerStatus.INITIAL,DecoratorManagerStatus.ERROR].includes(this.#status)){
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
    async onStart(...args: any[]){
        //throw new Error("Method not implemented.");
    }
    async onStop(...args: any[]){
        //throw new Error("Method not implemented.");
    }     
    stop() {
        
    }
    /**
     * 将使用装饰器的实例注册到管理器中
     * @param instance 
     */
     register(instance:DecoratorManager){
        if(!this.#instances.includes(instance)) this.#instances.push(instance)
    }
} 





/**
 * 创建装饰器管理器访问代理
 */
function createDecoratorManagerProxy(){

}

/**
 * 在指定的类上面定义一个`${firstUpperCase(decoratorName)}Manager`的属性用来访问管理器装饰器

   T: 管理器类
   O: 管理器装饰器的参数
 * 
 * @param runContexts   
 * @param targetClass 
 * @param decoratorName 
 * @param managerClass 管理器类对象
 * @param options      管理器装饰器的参数
 */
function defineDecoratorManagerProperty<T extends Constructor,O extends DecoratorManagerOptions>(runContexts:Record<string,any>,targetClass:T,decoratorName:string,managerClass :typeof DecoratorManager,options:O){
    const managerPropName = `${decoratorName}Manager`
    const managerInstancePropName = `__${decoratorName}ManagerInstance__`
    Reflect.defineProperty(targetClass.prototype,managerPropName,
        {
            get: function() { 
                const scope =  options.scope == 'class' ? this.constructor : (options.scope == 'instance' ?  this : runContexts[decoratorName])
                if(!hasOwnProperty(scope,managerInstancePropName)){
                    scope[managerInstancePropName]  = new managerClass(decoratorName,options)
                    scope[managerInstancePropName].register(this)
                } 
                return scope[managerInstancePropName]    
            }
        }
    )     
}

export interface ManagerDecoratorCreator<T extends DecoratorManager,O extends DecoratorManagerOptions>{ 
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
 export function createManagerDecorator<T extends DecoratorManager,O extends DecoratorManagerOptions>(context:Record<string,any>, decoratorName:string,managerClass :typeof DecoratorManager,  defaultOptions?:O):ManagerDecoratorCreator<T,O>{
    return (options?: O):TypedClassDecorator<T>=>{
        return function<T extends Constructor>(this:any,targetClass: T){  
            let finalOptions = Object.assign({},defaultOptions || {},options)
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
 * 
 */
 function createManagerInjector<T extends DecoratorManagerOptions>(options:T){
    
    
}
