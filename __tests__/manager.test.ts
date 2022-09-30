import { beforeEach,expect, test,vi } from 'vitest'
import {  
    createDecorator    
} from "../src/index" 
import { delay } from "../src/utils"
import { DecoratorOptions } from '../src/decorator';
import { DecoratorManager, DecoratorManagerOptions } from '../src/manager';

interface CacheOptions extends DecoratorOptions{
    ttl?:number
    key?:string
}
interface CacheManagerOptions extends DecoratorManagerOptions{
    backend?:string
    ttl?:number
}

class CacheManager extends DecoratorManager{
    static seq :number = 0;
    id:number = 0
    #values:Record<string,any> ={}
    constructor(decoratorName:string,options:Record<string,any>){
        super(decoratorName,options)
        this.id = ++CacheManager.seq
    }
    set(key:string,value:any,ttl:number=0){
        this.#values[key] = [value,ttl,Date.now()]
    }
    get(key:string,defaultValue?:any):any{
        if(key in this.#values){
            let [value,ttl,time] = this.#values[key]
            if(ttl==0 || Date.now() - time < ttl){
                return value
            }else{
                delete this.#values[key]
            }
        }
        return defaultValue        
    }
    async onStart(){

    }
    async onStop(){

    }
}

//
const cache = createDecorator<CacheOptions>("cache",{ttl:0,key:undefined},{    
    wrapper:function(method:Function,options:CacheOptions,manager?:DecoratorManager):Function {
        return async function(this:any){
            let key= String(options.key || options.id)
            let result
            if(manager){
                result  =  (manager as CacheManager).get(key)
            }
            if(result==undefined){
                result =await method.apply(this,arguments)
                if(manager) (manager as CacheManager).set(key,result)
            }
            return  result
        }
    },
    manager:CacheManager
})

const cacheScope = cache.createManagerDecorator<CacheManager,CacheManagerOptions>(CacheManager,{
    enable:true,
    ttl:10
})


beforeEach(async () => {
    await cache.destroyManager()
})

interface ICacheManager{
    getCacheManager():CacheManager
}

test("Cache装饰器自动创建管理器",async ()=>{
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    await expect(a1.getData()).resolves.toBe(0)
    a1.value = 2
    await expect(a1.getData()).resolves.toBe(0);
    a1.users = ["a","b"]
    await expect(a1.getUsers()).resolves.toStrictEqual(["a","b"])
    a1.users = ["a","b","c"]
    await expect(a1.getUsers()).resolves.toStrictEqual(["a","b"])    
})
test("自动启动Cache装饰器全局管理器装饰",async ()=>{
    // 当第一次调用被装饰方法时会自动启动管理器
    @cacheScope()       // 没有参数时为全局管理器
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    let cacheManager:CacheManager = (a1 as any).cacheManager
    expect(cacheManager).toBeInstanceOf(CacheManager)
    expect(cacheManager.running).toBe(false)
    await expect(a1.getData()).resolves.toBe(0)
    expect(cacheManager.running).toBe(true)
})

test("手动启动Cache装饰器全局管理器",async ()=>{
    @cacheScope()       // 没有参数时为全局管理器
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let onStart = vi.fn()
    let onStop = vi.fn()
    let a1 = new A()
    let cacheManager:CacheManager = (a1 as any).cacheManager
    cacheManager.onStart = onStart.bind(cacheManager)
    cacheManager.onStop = onStop.bind(cacheManager)
    
    expect(cacheManager).toBeInstanceOf(CacheManager)
    expect(cacheManager.running).toBe(false)
    await cacheManager.start()
    expect(onStart.mock.calls.length).toBe(1);
    expect(cacheManager.running).toBe(true)
    await expect(a1.getData()).resolves.toBe(0)
    
    
})

test("所有实例均共享一个全局Cache装饰器管理器",async ()=>{
    @cacheScope()       // 没有参数时为全局管理器
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    let a2 = new A()
    let a3 = new A()
    let cacheManager1:CacheManager = (a1 as any).cacheManager
    let cacheManager2:CacheManager = (a2 as any).cacheManager
    let cacheManager3:CacheManager = (a3 as any).cacheManager    
    expect(cacheManager1).toBe(cacheManager2)
    expect(cacheManager1).toBe(cacheManager3)    
})


test("实例作用域Cache装饰器管理器",async ()=>{
    @cacheScope({
        scope:"instance"
    })       // 没有参数时为全局管理器
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    let a2 = new A()
    let a3 = new A()
    let cacheManager1:CacheManager = (a1 as any).cacheManager
    let cacheManager2:CacheManager = (a2 as any).cacheManager
    let cacheManager3:CacheManager = (a3 as any).cacheManager    
    
    expect(cacheManager1.running).toBe(false)
    expect(cacheManager2.running).toBe(false)
    expect(cacheManager3.running).toBe(false)

    expect(cacheManager1).not.toBe(cacheManager2)
    expect(cacheManager1).not.toBe(cacheManager3)    
    
})

test("实例作用域Cache装饰器管理器获取被装饰的方法",async ()=>{
    @cacheScope({
        scope:"instance"
    })       // 没有参数时为全局管理器
    class A{
        @cache()
        getData(){ }
        @cache()
        async getUsers(){}
        getCacheManager(){
            return (this as any).cacheManager
        }
    }
    @cacheScope({
        scope:"instance"
    }) 
    class B{
        @cache()
        getDataB(){ }
        @cache()
        async getUsersB(){}        
        getCacheManager(){
            return (this as any).cacheManager
        }
    }
    let a1 = new A()
    let b1 = new B()
    let aCacheManager:CacheManager = a1.getCacheManager()
    let bCacheManager:CacheManager = b1.getCacheManager()
    expect(Object.keys(aCacheManager.getMethods()  )).toStrictEqual(["getData", "getUsers"])
    expect(Object.keys(bCacheManager.getMethods()  )).toStrictEqual(["getDataB", "getUsersB"])
})


test("类作用域Cache装饰器管理器",async ()=>{
    @cacheScope({
        scope:"class"
    })       // 没有参数时为全局管理器
    class A{
        value:number = 0
        users:string[] = []
        @cache()
        getData(){
            return this.value
        }
        @cache()
        async getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    let a2 = new A()
    let a3 = new A()
    let cacheManager1:CacheManager = (a1 as any).cacheManager
    let cacheManager2:CacheManager = (a2 as any).cacheManager
    let cacheManager3:CacheManager = (a3 as any).cacheManager    
    
    expect(cacheManager1.running).toBe(false)
    expect(cacheManager2.running).toBe(false)
    expect(cacheManager3.running).toBe(false)

    expect(cacheManager1).toBe(cacheManager2)
    expect(cacheManager1).toBe(cacheManager3)    

    await cacheManager1.start()

    expect(cacheManager1.running).toBe(true)
    expect(cacheManager2.running).toBe(true)
    expect(cacheManager3.running).toBe(true)

    
})
test("类作用域Cache装饰器管理器获取被装饰的方法",async ()=>{
    @cacheScope({
        scope:"class"
    })       // 没有参数时为全局管理器
    class A{
        @cache()
        getData(){ }
        @cache()
        async getUsers(){}
        getCacheManager(){
            return (this as any).cacheManager
        }
    }
    @cacheScope({
        scope:"class"
    }) 
    class B{
        @cache()
        getDataB(){ }
        @cache()
        async getUsersB(){}        
        getCacheManager(){
            return (this as any).cacheManager
        }
    }
    let a1 = new A()
    let b1 = new B()
    let aCacheManager:CacheManager = a1.getCacheManager()
    let bCacheManager:CacheManager = b1.getCacheManager()
    expect(Object.keys(aCacheManager.getMethods(a1))).toStrictEqual(["getData", "getUsers"])
    expect(Object.keys(bCacheManager.getMethods(b1))).toStrictEqual(["getDataB", "getUsersB"])
})

test("获取全局管理器",async ()=>{   // 没有参数时为全局管理器
    class A{
        @cache()
        getData(){ }
        @cache()
        async getUsers(){}
        getCacheManager(){
            return (this as any).cacheManager
        }
    }
    let a1 = new A()    
    let manager = cache.getManager()
    expect(manager).toBeInstanceOf(DecoratorManager)
})
