/**
 * 装饰器管理器
 */

import { getDecorators } from "./methods";
import { AsyncFunction } from "./types";


interface DecoratorList{
    [methodName: string]: {
        
    }[]
}

type DecoratorManageMode = 'none' | 'auto' | 'manual'

interface IDecoratorManager{
    get mode():DecoratorManageMode
    get ready(): boolean                        // 
    init(...args: any[]): Awaited<Promise<any>> 
    start(...args: any[]):Awaited<Promise<any>>
    stop(...args: any[]): Awaited<Promise<any>>
    [Symbol.iterator]():any             // 迭代装饰器所有方法
}

export interface DecoratorManagerOptions{
    enable:boolean;                // 是否启用/禁用装饰器
}

/**
 * 装饰器管理器基类
 */
export class DecoratorManager implements IDecoratorManager{    
    #instance:any = null                                   // 指向类实例
    #decoratorName:string = ""                             // 装饰器名称
    #options:Record<string,any>  
    #ready:boolean
    #mode:string = 'none'                                  // 管理模式，none=无，auto=自动,manual=手动
    constructor(instance:any,decoratorName:string,options:Record<string,any>){
        this.#instance = instance;
        this.#decoratorName=decoratorName
        this.#ready = false
        instance[`${decoratorName}DecoratorManager`] = this
        this.#options = Object.assign({
            enable:true
        },options)
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
    get ready(): boolean {
        return this.#ready
    }
    /**
     * 绑定当前实例
     * @param instance 
     */
    bind(instance:any){
        this.#instance = instance
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
    enable:boolean;                // 是否启用/禁用装饰器
}


type Constructor = { new (...args: any[]): any };
type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void;

/**
 * 
 * 创建管理器装饰器
 * 
 *  该装饰器会在被装饰的类原型上生成一个_${decoratorName}Manager的属性
 *  通过该属性可以读取到当前类指定装饰器的所有信息
 * 
 *  @cacheManager
 *  T: 管理器类
 *  O: 管理器类配置参数类型
 */
 export function createManagerDecorator<T extends DecoratorManager,O extends DecoratorManagerOptions>(decoratorName:string,managerClass :typeof DecoratorManager,  defaultOptions?:O){
    return (options?: O):TypedClassDecorator<T>=>{
        return function<T extends Constructor>(this:any,targetClass: T){  
            let managerInstance 
            Object.defineProperty(targetClass.prototype,`_${decoratorName}Manager`,
                {
                    get: function() { 
                        if(managerInstance && managerInstance instanceof DecoratorManager)  return managerInstance
                        // 创建实例
                        let decoratorList = getDecorators(this,decoratorName)
                        managerInstance = new managerClass(this,decoratorName,defaultOptions)
    
                        
                    }
                }
            ) 
        }
    }
    
 }