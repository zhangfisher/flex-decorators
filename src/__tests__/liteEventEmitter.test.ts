import { expect, test, beforeEach,vi} from 'vitest'
import { LiteEventEmitter } from "../liteEventEmitter" 




test("触发普通同步事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn()    
    emitter.on("click",fn)
    emitter.emit("click",1)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1)
    emitter.emit("click",1,2,3)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1,2,3)
})

test("触发普通同步事件时出错",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn(()=>{throw new Error("1")})    
    emitter.on("click",fn)
    // 第一次没有错误
    try{
        emitter.emit("click",1)
        expect(fn).toHaveBeenCalled()
        emitter.options.ignoreError = false
        emitter.emit("click",2)
    }catch(e:any){
        expect(e.message).toBe("1")
    }    
})

test("触发普通同步事件多个订阅",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn()    

    new Array(100).fill(0).forEach(()=>{
        emitter.on("click",fn)
    })       
    emitter.emit("click",1)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledTimes(100)    
})



test("触发异步事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn(async ()=>{})
    emitter.on("click",fn)
    emitter.emit("click",1)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1)
    emitter.emit("click",1,2,3)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1,2,3)
})

test("触发异步事件并等待结果",async ()=>{
    let emitter = new LiteEventEmitter()
    let index = 0
    let fn = vi.fn(async ()=>{
        ++index
        if(index % 2 == 0){
            throw new Error()
        }else{
            return index
        }
    })
    let counter = new Array(100).fill(0)

    let expectedArgs = counter.map((v,i) =>i+1)

    expectedArgs.forEach((v)=>{
        emitter.on("click",fn)
    })   
    
    let results =await emitter.emitAsync("click")
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledTimes(100)    

    results.forEach((v,i)=>{
        if((i+1) % 2 == 0){
            expect(v).toBeInstanceOf(Error)
        }else{
            expect(v).toBe(i+1)
        }
    })
})


test("只触发一次的订阅事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn()    
    emitter.once("click",fn)
    expect(emitter.getListeners("click").length).toBe(1)
    emitter.emit("click",1)
    expect(emitter.getListeners("click").length).toBe(0)
    emitter.emit("click",1)
    emitter.emit("click",1)
    emitter.emit("click",1)
    emitter.emit("click",1)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1)
})


test("触发/订阅通配符事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn1 = vi.fn()    
    emitter.on("*/a",fn1)
    emitter.emit("x/a")
    emitter.emit("y/a")
    emitter.emit("*/a")
    expect(fn1).toHaveBeenCalled()
    expect(fn1).toHaveBeenCalledTimes(3)

    let fn2 = vi.fn()   
    emitter.on("a/*/c",fn2)
    emitter.emit("a/1/c")
    emitter.emit("a/2/c")
    emitter.emit("a/*/c")
    expect(fn2).toHaveBeenCalled()
    expect(fn2).toHaveBeenCalledTimes(3)
})
test("订阅多次事件",async ()=>{
    let emitter = new LiteEventEmitter() 
    let fn = vi.fn()    
    emitter.on("click",fn,3)
    expect(emitter.getListeners("click").length).toBe(1)
    emitter.emit("click")
    emitter.emit("click")
    emitter.emit("click")
    emitter.emit("click")
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledTimes(3)
    expect(emitter.getListeners("click").length).toBe(0)
})





test("订阅/退订事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn()    
    emitter.on("click",fn)
    expect(emitter.getListeners("click").length).toBe(1)

    emitter.emit("click",1)
    expect(fn).toHaveBeenCalled()
    expect(fn).toHaveBeenCalledWith(1)
    emitter.off("click",fn)
    emitter.emit("click")
    expect(fn).toHaveBeenCalled()
    expect(emitter.getListeners("click").length).toBe(0)
})

test("订阅/退订通配符事件",async ()=>{
    let emitter = new LiteEventEmitter()
    let fn = vi.fn()    
    emitter.on("a/1",fn)
    emitter.on("a/2",fn)
    emitter.on("a/3",fn)
    expect(emitter.getListeners("a/*").length).toBe(3)

    emitter.off("a/1",fn)
    expect(emitter.getListeners("a/*").length).toBe(2)
    emitter.off("a/2",fn)
    expect(emitter.getListeners("a/*").length).toBe(1)
    emitter.off("a/3",fn)
    expect(emitter.getListeners("a/*").length).toBe(0)

    emitter.on("a/1",fn)
    emitter.on("a/2",fn)
    emitter.on("a/3",fn)
    expect(emitter.getListeners("a/*").length).toBe(3)
    emitter.off("a/*",fn)
    expect(emitter.getListeners("a/*").length).toBe(0)
})





