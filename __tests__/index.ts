import { createMethodDecorator,getDecorators,GetDecoratorOptionsProxy,DecoratorBaseOptions } from "../src/index"
 

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
let log = createMethodDecorator<logOptions>("log",{},{
    wrapper:logWrapper
})

const logProWrapper = function(method:Function,getOptions:GetDecoratorOptionsProxy<logOptions>):Function{
    return function(this:any){
        let options = getOptions(this)
        if(options.prefix) logs.push(options.prefix)
        logs.push(method(...arguments))
        if(options.suffix) logs.push(options.suffix)
    }
}
let logPro = createMethodDecorator<logOptions>("logPro",{},{
    wrapper:logProWrapper,
    proxyOptions:true
})


interface MyCacheOptions extends DecoratorBaseOptions{
    key?:string,
    ttl?:number
}
let myCache = createMethodDecorator<MyCacheOptions>("myCache",{
    ttl:0
},{
    proxyOptions:true,
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


class A{
    logDecorators = {}
    constructor(){
        this.logDecorators = getDecorators(this,"log")    
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
        return r
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

test("日志装饰器",(done)=>{
    let a1 = new A()
    a1.print("x")
    expect(logs).toStrictEqual(["Before","x","After"])
    expect(Object.keys(a1.logDecorators)).toStrictEqual(["print"])

    let aa1 = new AA()
    aa1.print("x")
    expect(logs).toStrictEqual(["Before","x","After","x"])
    


    done()
})

test("继承的日志装饰器",(done)=>{
    let aa1 = new AA()
    aa1.print("x")
    aa1.print2("x")
    expect(Object.keys(aa1.logDecorators)).toStrictEqual(["print","print2"])
    expect(logs).toStrictEqual([
        "x",
        "AA-Before","x","AA-After"
    ])
    done()
})



test("从实例中读取日志装饰器参数",(done)=>{
    let aa1 = new AA()
    aa1.printPro("x")
    expect(Object.keys(getDecorators(aa1,"logPro"))).toStrictEqual(["printPro"])
    expect(logs).toStrictEqual([
        "Pro:","x","LogPro-After"
    ])
    done()
})
