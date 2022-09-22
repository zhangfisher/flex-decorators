/**
 * 装饰器管理器
 */

import { getDecorators } from "./methods";
import { hasOwnProperty } from "./utils";

interface DecoratorList{
    [methodName: string]: {
        
    }[]
}

type DecoratorManageMode = 'none' | 'auto' | 'manual'

interface IDecoratorManager{
    get mode():DecoratorManageMode
    get ready(): boolean                        // 
    get running(): boolean     
    init(...args: any[]): Awaited<Promise<any>> 
    start(...args: any[]):Awaited<Promise<any>>
    stop(...args: any[]): Awaited<Promise<any>>
    [Symbol.iterator]():any             // 迭代装饰器所有方法
}

export interface DecoratorManagerOptions{
    enable:boolean;                // 是否启用/禁用装饰器
}

/**
 * 管理器的状态
 */
export enum DecoratorManagerStatus {
    INITIAL      = 0,
    INITIALIZING = 1,
    READY        = 3,
    STARTING     = 4,
    RUNNING      = 5,
    STOPING      = 6,
    STOPED       = 7,
    ERROR        = 9
}

/**
 * 装饰器管理器基类
 */
export class DecoratorManager implements IDecoratorManager{    
    #instance:any = null                                   // 指向类实例
    #decoratorName:string = ""                             // 装饰器名称
    #options:Record<string,any>  
    #ready:boolean
    #running: boolean 
    #mode:string = 'none'                                  // 管理模式，none=无，auto=自动,manual=手动
    constructor(instance:any,decoratorName:string,options:Record<string,any>){
        this.#instance = instance;
        this.#decoratorName=decoratorName
        this.#ready = false
        this.#running = false
        instance[`${decoratorName}DecoratorManager`] = this
        this.#options = Object.assign({
            enable:true
        },options)
    }
    get ready(): boolean { return this.#ready }
    get running(): boolean { return this.#running   }

    async _init(...args: any[]) {
        try{
            await this.init(...args)
            this.#ready = true
        }catch(err){            
        }
    }
    async init(...args: any[]) {
        this.#ready = true
    }
    /**
     * 迭代当前实例使用了指定装饰器的所有信息
     * @returns   {Object} {[方法名称]:[<装饰器参数>,<装饰器参数>,...,<装饰器参数代理>]}
     */
    [Symbol.iterator]() {
        return Object.entries(getDecorators(this.#instance,this.#decoratorName))[Symbol.iterator]()
    }
    get mode(): DecoratorManageMode {
        throw new Error("Method not implemented.");
    }

    /**
     * 绑定当前实例
     * @param instance 
     */
    bind(instance:any){
        this.#instance = instance
    }
    async _start(...args: any[]){
        
    }
    async start(...args: any[]){
        
    }
    async stop(...args: any[]){
        throw new Error("Method not implemented.");
    } 
    get instance(){return this.#options}
    get options(){return this.#instance}
    get decoratorName(){return this.#decoratorName}
    get enable():boolean{ return this.#options.enable  }
    set enable(value:boolean){ this.#options.enable =value }
} 


export interface DecoratorManagerOptions{
    enable:boolean                              // 是否启用/禁用装饰器
    scope?: 'class' | 'instance'                 // 管理器作用域
}


type Constructor = { new (...args: any[]): any };
type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void;

/**
 * 
 * 创建管理器装饰器
 * 
 *  该装饰器会在被装饰的类原型上生成一个${decoratorName}Manager的属性
 *  通过该属性可以读取到当前类指定装饰器的所有信息
 * 
 * 
 * 
 *  @cacheManager({
 *      scope:"class"
 * })
 *  T: 管理器类
 *  O: 管理器类配置参数类型
 */
 export function createManagerDecorator<T extends DecoratorManager,O extends DecoratorManagerOptions>(decoratorName:string,managerClass :typeof DecoratorManager,  defaultOptions?:O){
    return (options?: O):TypedClassDecorator<T>=>{
        let finalOptions = Object.assign({scope:"instance"},defaultOptions,options)
        return function<T extends Constructor>(this:any,targetClass: T){  
            let managerPropName = `${decoratorName}Manager`
            let managerInstancePropName = `__${decoratorName}ManagerInstance__`
            Object.defineProperty(targetClass.prototype,managerPropName,
                {
                    get: function() { 
                        let scope =  finalOptions.scope == 'class' ? this.constructor : this
                        if(!hasOwnProperty(scope,managerInstancePropName)){
                            scope[managerInstancePropName]  = new managerClass(this,decoratorName,finalOptions)
                        } 
                        return scope[managerInstancePropName]                        
                    }
                }
            ) 
        }
    }
    
 }