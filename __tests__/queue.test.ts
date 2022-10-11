import { expect, test, beforeEach,beforeAll } from 'vitest'
import { delay } from "../src/utils"
import {
    queue,IQueueDecoratorOptionsReader,QueueTask,QueueManager
} from "../src/decorators/queue"

 

beforeEach(()=>{
    
})

beforeAll(()=>{    
    let manager = queue.getManager() as QueueManager     
})

test("排队执行",async ()=>{
    class A {      
        values:number[] = []
        @queue({objectify:true})
        async go(value:number){ 
            this.values.push(value)
            await delay(10)
        }
    }
    let a1 = new A()  
    let count = 8,tasks:QueueTask[] = []
    for(let i = 0; i < count;i++){
        tasks.push(a1.go(i) as unknown as QueueTask)
    }

    await Promise.all(tasks.map(task=>task.done()));
    expect(a1.values).toStrictEqual(new Array(count).fill(0).map((v,i) =>i))

})
 
test("排队执行溢出逻辑",async ()=>{
    class A {      
        values:number[] = []
        @queue({overflow:"discard",objectify:true})
        async goDiscard(value:number){ 
            this.values.push(value)
            await delay(20)
        }
        @queue({overflow:"overlap",objectify:true})
        async goOverlap(value:number){ 
            this.values.push(value)
            await delay(20)
        }
        @queue({overflow:"slide",objectify:true})
        async goSlide(value:number){ 
            this.values.push(value)
            await delay(20)
        }
    }
    let a1 = new A()  
    let manager = queue.getManager() as QueueManager    
    // 1. 溢出丢弃    
    let count = 20,tasks:QueueTask[] = []
    for(let i = 0; i < count;i++){
        tasks.push(a1.goDiscard(i) as unknown as QueueTask)
    }
    // 等待执行队列空
    await manager.getDispatcher(a1,'goDiscard')?.waitForIdle()
    // 默认队列缓冲区是8
    expect(a1.values).toStrictEqual(new Array(8).fill(0).map((v,i) =>i))

    // 2. 覆盖最后一条
    tasks = []
    a1.values = []
    for(let i = 0; i < count;i++){
        tasks.push(a1.goOverlap(i) as unknown as QueueTask)
    }
    // 等待执行队列空
    await manager.getDispatcher(a1,'goOverlap')?.waitForIdle()
    // 默认队列缓冲区是8
    expect(a1.values).toStrictEqual([0,1,2,3,4,5,6,19])

    // 3. 滑动
    tasks = []
    a1.values = []
    for(let i = 0; i < count;i++){
        tasks.push(a1.goSlide(i) as unknown as QueueTask)
    }
    // 等待执行队列空
    await manager.getDispatcher(a1,'goSlide')?.waitForIdle()
    // 默认队列缓冲区是8
    expect(a1.values).toStrictEqual([12,13,14,15,16,17,18,19])
})
 
test("排队执行失败重试",async ()=>{
    class A {      
        values:number[] = []
        retryCount:number = 0
        @queue({ 
            retryCount:5,
            failure:"retry",
            objectify:true
        })
        async go(value:number){ 
            this.values.push(value)
            this.retryCount++
            throw new Error()
        } 
    }
    let a1 = new A()  
    let task = a1.go(1) as unknown as QueueTask
    await task.done()
    // 第一次执行失败后，再重试5次，所以retryCount=6
    expect(a1.retryCount).toBe(6)  
})


test("排队任务执行超时处理",async ()=>{
    class A {      
        values:number[] = []
        retryCount:number = 0
        @queue({ 
            retryCount:5,
            failure:"retry",
            objectify:true
        })
        async go(value:number){ 
            this.values.push(value)
            this.retryCount++
            throw new Error()
        } 
    }
    let a1 = new A()  
    let manager = queue.getManager() as QueueManager    
    

    let task = a1.go(1) as unknown as QueueTask
    await task.done()
    // 第一次执行失败后，再重试5次，所以retryCount=6
    expect(a1.retryCount).toBe(6)  
})
