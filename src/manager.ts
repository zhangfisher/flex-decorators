/**
 * 装饰器管理器
 */

import { getDecorators, createDecorator } from './decorator';
import { hasOwnProperty,firstUpperCase } from "./utils";
import { asyncSignal, IAsyncSignal } from "./asyncSignal"
import { AllowNull } from "./types";

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
}

export interface DecoratorManagerOptions{
    enable:boolean;                // 是否启用/禁用装饰器
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
     * 将使用装饰器的实例注册到管理器中
     * @param instance 
     */
    register(instance:DecoratorManager){
        if(!this.#instances.includes(instance)) this.#instances.push(instance)
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
} 


export interface DecoratorManagerOptions{
    enable:boolean                                  // 是否启用/禁用装饰器
    scope?: 'class' | 'instance'                    // 管理器作用域
}


type Constructor = { new (...args: any[]): any };
type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void;


/**
 * 创建装饰器管理器访问代理
 */
function createDecoratorManagerProxy(){

}
