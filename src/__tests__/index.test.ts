import { expect, test, beforeEach } from 'vitest'
import { 
    createDecorator,getDecorators,DecoratorOptions ,
    DecoratorManager
} from "../index" 

import { 
    timeout,TimeoutOptions,ITimeoutDecoratorOptionsReader 
} from "../decorators" 


async function delay(ms:number=10){
    return new Promise(resolve =>setTimeout(resolve,ms))
}

let logs:string[] = [];

interface logOptions  {
    id?:number
    prefix?:string
    suffix?:string
}
const logWrapper = function(method:Function,options:logOptions):Function{
    return function(){
        if(options.prefix) logs.push(options.prefix)
        logs.push(method(...arguments))
        if(options.suffix) logs.push(options.suffix)
    }
}
class LogManager extends DecoratorManager{

}
let log = createDecorator<logOptions>("log",{
    id:0,
    prefix:'',
    suffix:''
},{
    wrapper:logWrapper,
    manager:LogManager
})


type logProMethod = (info:string)=>string

const logProWrapper = function(method:logProMethod,options:logOptions):logProMethod{
    return function(this:any,info:string){
        if(options.prefix) logs.push(options.prefix)
        logs.push(method(arguments[0]))
        if(options.suffix) logs.push(options.suffix)
        return ""
    }
}
let logPro = createDecorator<logOptions,logProMethod>("logPro",{},{
    wrapper:logProWrapper
})


interface MyCacheOptions extends DecoratorOptions{
    key?:string,
    ttl?:number
}
let myCache = createDecorator<MyCacheOptions>("myCache",{
    ttl:0
},{
    wrapper:function(method:Function,options:MyCacheOptions):Function{
        let caches:{[key:string | number]:any} = {}
        return function(this:any){
            if(options?.id && options?.id in caches) return caches[options.id]
            let result = method(...arguments)
            if(options?.id) return caches[options.id] = result
            return result
        }
    }
})


class A implements ITimeoutDecoratorOptionsReader{
    logDecorators = {}
    timeoutValue = 100
    runDelay = 10
    constructor(){
        this.logDecorators = getDecorators(this,"log")    
    }
    async getTimeoutDecoratorOptions(options: TimeoutOptions, methodName: string | symbol, decoratorName: string): Promise<TimeoutOptions> {
        options.value = this.timeoutValue
        return options
    }
    @log({
        prefix:"Before",
        suffix:"After"
    })
    print(info:string):string{
        return info
    }
    @myCache()
    getData(){
        return 1
    }
    @timeout()
    async run(){
        await delay(this.runDelay)
    }
}

class AA extends A{
    getLogProDecoratorOptions(options:logOptions,methodName:string,decoratorName:string):logOptions{
        if(methodName=="printPro"){
            options.prefix = "Pro:"
        }
        return options
    }
    @log()
    print(info:string):string{
        return info
    }
    @log({
        prefix:"AA-Before",
        suffix:"AA-After"
    })
    print2(info:string):string{
        return info
    }
    @logPro({
        prefix:"LogPro-Before",
        suffix:"LogPro-After"
    })
    printPro(info:string):string{
        return info
    }

}

beforeEach(()=>{
    logs=[]
})

test("日志装饰器",async ()=>{
    let a1 = new A()
    await a1.print("x")
    expect(logs).toStrictEqual(["Before","x","After"])
    expect(Object.keys(a1.logDecorators)).toStrictEqual(["print"])
    let aa1 = new AA()
    await aa1.print("x")
    expect(logs).toStrictEqual(["Before","x","After","x"])    
})
test("日志装饰器只会包装一次函数",async ()=>{
    let a1 = new A()
    let f1 = a1.print
    await a1.print("x")    
    await a1.print("x")
    let f2 = a1.print
    expect(f1).toBe(f2)
})

test("更新装饰器参数导致重新包装函数",async ()=>{
    class AX{
        prefix: string = "HYT";
        getDecoratorOptions(options:logOptions){
            options.prefix = this.prefix
            return options
        }
        @log()
        print(info:string){
            return info
        }
    }
    let a1 = new AX()
    await a1.print("x")
    expect(logs).toStrictEqual(["HYT", "x"])
    a1.prefix = "meeyi"
    logs=[]
    await a1.print("x")
    expect(logs).toStrictEqual(["meeyi", "x"])
})


test("继承的日志装饰器",async ()=>{
    let aa1 = new AA()
    await aa1.print("x")
    await aa1.print2("x")
    expect(Object.keys(aa1.logDecorators)).toStrictEqual(["print","print2"])
    expect(logs).toStrictEqual([
        "x",
        "AA-Before","x","AA-After"
    ])
})



test("从实例中读取日志装饰器参数",async ()=>{
    let aa1 = new AA()
    await aa1.printPro("x")
    expect(Object.keys(getDecorators(aa1,"logPro"))).toStrictEqual(["printPro"])
    expect(logs).toStrictEqual(["Pro:","x","LogPro-After"]) 
    expect(Object.keys(getDecorators(aa1,"logPro"))).toStrictEqual(["printPro"])
    expect(logs).toStrictEqual(["Pro:","x","LogPro-After"]) 
})


test("从实例中读取所有装饰器参数",async ()=>{
    let aa1 = new AA()
    let results= getDecorators(aa1)    
    expect(Object.keys(results)).toStrictEqual(["log","logPro","myCache","timeout"])
    results= getDecorators(aa1)    
    expect(Object.keys(results)).toStrictEqual(["log","logPro","myCache","timeout"])
})

test("从实例中读取被指定装饰器装饰的方法",async ()=>{
    let aa1 = new AA()
    let logManager = log.getManager()
    let methods = logManager?.getMethods(aa1)
    if(methods){
        expect(Object.keys(methods)).toStrictEqual(["print","print2"]) 
    }    
})

