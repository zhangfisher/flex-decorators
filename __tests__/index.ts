import { createMethodDecorator,getDecorators,GetDecoratorOptionsProxy,DecoratorMethodWrapperOptions } from "../src/index"
 

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
let logPro = createMethodDecorator<logOptions>("log",{},{
    wrapper:logProWrapper,
    proxyOptions:true
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
        suffix:"LogPro--After"
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
    expect(logs).toStrictEqual([
        "Pro","x"
    ])
    done()
})