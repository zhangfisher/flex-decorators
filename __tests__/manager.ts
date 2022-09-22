import {  
    cache,cacheManager,CacheOptions
} from "../src/index" 

async function delay(ms:number=10){
    return new Promise(resolve =>setTimeout(resolve,ms))
}

test("Cache装饰器",(done)=>{
    class A{
        @cache()
        getData(){
            return 1
        }
    }

    done()
})