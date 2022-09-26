import {  
    createDecorator
} from "../src/index" 
import { delay } from "../src/utils"
import { DecoratorOptions } from '../src/decorator';
import { DecoratorManager } from '../src/manager';
 
interface CacheOptions extends DecoratorOptions{
    ttl?:number
    key?:string
}

class CacheManager extends DecoratorManager{
    #values:Record<string,any> ={}
    set(key:string,value:any,ttl:number=0){
        this.#values[key] = [value,ttl,Date.now()]
    }
    get(key:string,defaultValue:any):any{
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
}

//
const cache = createDecorator<CacheOptions>("cache",{ttl:0,key:undefined},{    
    wrapper:function(method:Function,options:CacheOptions,manager?:DecoratorManager):Function {
        return function(this:any){
            let key= String(options.key || options.id)
            if(manager){
                return (manager as CacheManager).get(key,method.apply(this,arguments))
            }else{
                return method.apply(this,arguments)
            }            
        }
    },
    manager:CacheManager
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
        getUsers(){
            return this.users
        }
    }
    let a1 = new A()
    expect(a1.getData).resolves.toBe(0)
    a1.value = 2
    expect(a1.getData).resolves.toBe(0);
    
    (a1 as unknown as ICacheManager).getCacheManager
    
    
})