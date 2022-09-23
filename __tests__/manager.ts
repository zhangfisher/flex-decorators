import {  
    createDecorator
} from "../src/index" 
import { delay } from "../src/utils"
import { DecoratorOptions } from '../src/decorator';
import { DecoratorManager } from '../src/manager';
 
interface CacehOptions extends DecoratorOptions{
    ttl:number
    key:string
}

class CacheManager extends DecoratorManager{
    set(key:string,value:any){
    }
    get(key:string,defaultValue:any):any{
        return defaultValue
    }
}

const cache = createDecorator<CacehOptions>("cache",{
    ttl:0,
    key:"a"
},{
    wrapper:function(method:Function,options:CacehOptions,manager?:DecoratorManager):Function {
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

test("Cache装饰器自动创建管理器",async ()=>{
    class A{
        value:number = 0
        @cache()
        getData(){
            return this.value
        }
    }
    let a1 = new A()
    let value = await a1.getData()
    a1.value = 2
    
})