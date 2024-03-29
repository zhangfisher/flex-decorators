import { expect, test, beforeEach } from 'vitest'
import { 
    createDecorator,getDecorators,DecoratorOptions ,
    resetMethodDecorator,
} from "../index" 
import {delay } from "flex-tools"
import { createLiteDecorator } from '../liteDecorator';

import { 
    timeout,TimeoutOptions,ITimeoutDecoratorOptionsReader,
    retry,RetryOptions,IRetryDecoratorOptionsReader,
    noReentry,debounce,throttle
} from "../decorators" 

 

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
let log = createDecorator<logOptions>("log",{},{
    wrapper:logWrapper
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
 

test("超时装饰器",async ()=>{
    let a1= new A()
    // 第一运行没有超时
    let t1 =Date.now()
    a1.timeoutValue = 100
    await a1.run()
    let t2 =Date.now()
    expect(t2-t1).toBeLessThan(a1.timeoutValue)
    expect(t2-t1).toBeGreaterThanOrEqual(a1.runDelay)
    // 第二运行超时
    a1.timeoutValue = 100
    a1.runDelay = 200
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
    class R implements IRetryDecoratorOptionsReader{
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
    await expect(r1.test.bind(r1)).rejects.toThrow(Error);
    expect(r1.runCount).toBe(2)

    // 第2次执行
    r1.runCount=0
    r1.count=2
    await expect(r1.test1.bind(r1)).rejects.toThrow(Error);
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
    expect(x.runs.length).toBeGreaterThan(20)
})

test("装饰器参数变更导致重新包装函数",async ()=>{
    // 执行计数
    interface countOptions  {
        id?:number
        max:number
        prefix?:string
        items?:number[]
    }
    let count = createDecorator<countOptions>("count", {max:10,prefix:"Hello",items:[1,2]},{
        wrapper:(method:Function,options:countOptions)=>{
            let count = 0;  // 在一个闭包中保存计数
            return function(this:any){
                count++
                if(count>options.max) count =0
                this.current = count
            }
        }
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
        max?:number
        prefix?:string
        items?:number[]
    }
    let count = createDecorator<countOptions>("count", {max:10,prefix:"Hello",items:[1,2]},{
        wrapper:(method:Function,options:Required<countOptions>)=>{
            let count = 0;  // 在一个闭包中保存计数
            return function(this:any){
                count++
                if(count>options.max) count =0
                this.current = count
            }
        },
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
        await x.go()
    }
    expect(x.current).toBe(0)
    // 执行11次后，计数变为0
    x.max =100 // 重新修改了装饰器参数，因此将重新包装函数使新参数生效
    resetMethodDecorator(x,"count")
    for(let i = 0; i<101;i++){
        await x.go()
    }
    expect(x.current).toBe(0)
    x.max =200 // 重新修改了装饰器参数，因此将重新包装函数使新参数生效
    resetMethodDecorator(x,"count",999)
    for(let i = 0; i<201;i++){
        await x.go()
        if(i<200) expect(x.current).toBe(i+1)
    }
    expect(x.current).toBe(0)
})



test("被装饰方法类型",async ()=>{
    // 执行计数
    interface countOptions  {
        id?:number
        max?:number
        prefix?:string
        items?:number[]
    }
    let count = createLiteDecorator<countOptions,any,(data:number)=>boolean | string>("count", {max:10,prefix:"Hello",items:[1,2]})
    let cache = createDecorator<countOptions,any,(data:number)=>number>("cache", {max:10,prefix:"Hello",items:[1,2]})

    class MyClass{

        @count()
        test(data:number){
            return true
        }
        @cache()
        getUser(){
            return 1
        }
    }
    
})


