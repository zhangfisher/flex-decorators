import { 
    createMethodDecorator,getDecorators,MethodDecoratorOptions ,
    timeout,TimeoutOptions,IGetTimeoutDecoratorOptions,    
    retry,RetryOptions,IGetRetryDecoratorOptions,
    noReentry,
    debounce,DebounceOptions,
    throttle,ThrottleOptions,
    resetMethodDecorator
} from "../src/index" 

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
let log = createMethodDecorator<logOptions>("log",{},{
    wrapper:logWrapper
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
let logPro = createMethodDecorator<logOptions,logProMethod>("logPro",{},{
    wrapper:logProWrapper,
    proxyOptions:true
})


interface MyCacheOptions extends MethodDecoratorOptions{
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


class A implements IGetTimeoutDecoratorOptions{
    logDecorators = {}
    timeoutValue = 100
    runTimes = 10
    constructor(){
        this.logDecorators = getDecorators(this,"log")    
    }
    getTimeoutDecoratorOptions(options: TimeoutOptions, methodName: string | symbol, decoratorName: string): TimeoutOptions {
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
        await delay(this.runTimes)
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



test("超时装饰器",async ()=>{
    let a1= new A()
    // 第一运行没有超时
    let t1 =Date.now()
    a1.timeoutValue = 100
    await a1.run()
    let t2 =Date.now()
    expect(t2-t1).toBeLessThan(a1.timeoutValue)
    expect(t2-t1).toBeGreaterThanOrEqual(a1.runTimes)
    // 第二运行超时
    a1.timeoutValue = 100
    a1.runTimes = 200
    t1 =Date.now()
    try{
        await a1.run()
    }catch(e:any){
        expect(e.message).toBe("TIMEOUT")
    }
})


test("超时采用默认值的装饰器",async ()=>{
    class X{
        @timeout(100)
        async run(){
            await delay(200)
        }
    }    
    let x1 = new X();
    let t1 =Date.now()
    try{
        await x1.run()
    }catch(e:any){
        expect(e.message).toBe("TIMEOUT")        
        let t2 =Date.now()        
        expect(t2-t1).toBeGreaterThan(100)
        expect(t2-t1).toBeLessThan(200)
    }
})

test("重试装饰器",async ()=>{
    class R implements IGetRetryDecoratorOptions{
        interval=0
        count=1
        runCount = 0
        getRetryDecoratorOptions(options: RetryOptions, methodName: string | symbol, decoratorName: string): RetryOptions {
            options.count = this.count
            options.interval= this.interval
            return options
        }
        @retry()
        test(){
            this.runCount++
            throw new Error()
        }
        @retry({count:2})
        test1(){
            this.runCount++
            throw new Error()
        }
        @retry({count:2})
        async test2(){
            this.runCount++ 
            await delay(100)                       
            throw new Error()
        }
    } 
    
    let r1 = new R()
    // 第1次执行,默认参数是重试一次
    expect(r1.test.bind(r1)).rejects.toThrow(Error);
    expect(r1.runCount).toBe(2)

    // 第2次执行
    r1.runCount=0
    r1.count=2
    expect(r1.test1.bind(r1)).rejects.toThrow(Error);
    expect(r1.runCount).toBe(3) //第一执行失败后再重试2次共3次

    // 第3次执行
    r1.runCount=0
    r1.count=2
    let t1 = Date.now()
    try{
        await r1.test2()
    }catch(e){
        let t2= Date.now()
        expect(t2-t1).toBeGreaterThan(3*100)
        expect(r1.runCount).toBe(3) //第一执行失败后再重试2次共3次
    }
    // 第4次执行
    r1.runCount=0
    r1.count=2
    r1.interval=100
    t1 = Date.now()
    try{
        await r1.test2()
    }catch(e){
        let t2= Date.now()
        expect(t2-t1).toBeGreaterThan(3*100+200)
        expect(r1.runCount).toBe(3) //第一执行失败后再重试2次共3次
    }
})



test("不可重入装饰器",async ()=>{
    class X{
        value=0
        @noReentry()
        async test(){
            this.value++
            await delay(100)
        }
        @noReentry(false)
        async testError(){
            this.value++
            await delay(100)
        }
    }
    let x = new X()

    await Promise.all([x.test(),x.test(),x.test()])
    expect(x.value).toBe(1)
    // 由于重入时会出错,的
    try{
        x.value=0
         await Promise.all([x.testError(),x.testError(),x.testError()])        
    }catch(err:any){
        expect(err.message).toBe("noReentry")
    }finally{
        expect(x.value).toBe(1)
    }

})
test("防抖动装饰器",async ()=>{
    let baseTime = Date.now()
    class X{
        runs:number[] =[]
        interval: number = 100
        @debounce(10)
        async test(){
            this.runs.push(Date.now()-baseTime);
        }
    }
    let x = new X()

    for(let i=0; i<100;i++){
        await delay(5)
        await x.test()
    }
    expect(x.runs.length).toBe(1)
    await delay(10)
    for(let i=0; i<100;i++){
        await delay(5)
        await x.test()
    }
    expect(x.runs.length).toBe(2)    

})

test("节流装饰器",async ()=>{
    let baseTime = Date.now()
    class X{
        runs:number[] =[]
        interval: number = 100
        @throttle(20)
        async test(){
            this.runs.push(Date.now()-baseTime);
        }
    }
    let x = new X()
    for(let i=0; i<100;i++){
        await delay(5)
        await x.test()
    }
    expect(x.runs.length).toBeLessThan(60)
    expect(x.runs.length).toBeGreaterThan(40)
})

test("装饰器参数变更导致重新包装函数",async ()=>{
    // 执行计数
    interface countOptions  {
        id?:number
        max:number
        prefix?:string
        items?:number[]
    }
    let count = createMethodDecorator<countOptions>("count", {max:10,prefix:"Hello",items:[1,2]},{
        wrapper:(method:Function,options:countOptions)=>{
            let count = 0;  // 在一个闭包中保存计数
            return function(this:any){
                count++
                if(count>options.max) count =0
                this.current = count
            }
        },
        proxyOptions:true
    })
    class X {
        customOptions: Record<string,any> = {}
        max: number = 10
        current: number = 0
        constructor(){

        }
        getCountDecoratorOptions(options:countOptions){
            options.max = this.max
            return options
        }
        @count()
        go(){

        }
    }
    let x = new X()
    // 执行11次后，计数变为0
    x.max =10
    for(let i = 0; i<11;i++){
        x.go()
    }
    expect(x.current).toBe(0)
    // 执行11次后，计数变为0
    x.max =100 // 重新修改了装饰器参数，因此将重新包装函数使新参数生效
    for(let i = 0; i<101;i++){
        x.go()
    }
    expect(x.current).toBe(0)
})
test("手动重置装饰器重新包装函数",async ()=>{
    // 执行计数
    interface countOptions  {
        id?:number
        max:number
        prefix?:string
        items?:number[]
    }
    let count = createMethodDecorator<countOptions>("count", {max:10,prefix:"Hello",items:[1,2]},{
        wrapper:(method:Function,options:countOptions)=>{
            let count = 0;  // 在一个闭包中保存计数
            return function(this:any){
                count++
                if(count>options.max) count =0
                this.current = count
            }
        },
        proxyOptions:true,
        autoReWrapper:false
    })
    class X {
        customOptions: Record<string,any> = {}
        max: number = 10
        current: number = 0
        constructor(){

        }
        getCountDecoratorOptions(options:countOptions){
            options.max = this.max
            return options
        }
        @count({id:999})
        go(){

        }
    }
    let x = new X()
    // 执行11次后，计数变为0
    x.max =10
    for(let i = 0; i<11;i++){
        x.go()
    }
    expect(x.current).toBe(0)
    // 执行11次后，计数变为0
    x.max =100 // 重新修改了装饰器参数，因此将重新包装函数使新参数生效
    resetMethodDecorator(x,"count")
    for(let i = 0; i<101;i++){
        x.go()
    }
    expect(x.current).toBe(0)
    x.max =200 // 重新修改了装饰器参数，因此将重新包装函数使新参数生效
    resetMethodDecorator(x,"count",999)
    for(let i = 0; i<201;i++){
        x.go()
        if(i<200) expect(x.current).toBe(i+1)
    }
    expect(x.current).toBe(0)
})