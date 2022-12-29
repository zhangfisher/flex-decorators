import { expect, test, beforeEach,beforeAll } from 'vitest'
import { delay } from "flex-tools"
import {
    queue,IQueueDecoratorOptionsReader,QueueTask,QueueManager, QueueOptions
} from "../decorators/queue"

 

beforeEach(()=>{
    
})

beforeAll(()=>{    
    let manager = queue.getManager() as QueueManager    
    manager.defaultDecoratorOptions.objectify = true 
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


test("排队任务过期自动清理",async ()=>{
    let tasks = [] , count = 10 ,discardCount:number = 0
    class A {      
        values:number[] = []
        @queue({
            length:10,
            maxQueueTime:20   // 最大排队时间
        })
        async go(value:number){ 
            this.values.push(value)
            await delay(100)
        } 
    }
    let a1 = new A() 
    for(let i = 0; i < count;i++){
        tasks.push(a1.go(i) as unknown as QueueTask)
    } 
    let manager = queue.getManager() as QueueManager    
    let dispatcher = manager.getDispatcher(a1,'go')
    dispatcher?.on("discard",() => discardCount++ )
    await dispatcher?.waitForIdle()    

    expect(a1.values.length).toBe(1)   
    expect(a1.values[0]).toBe(0)    
    expect(discardCount).toBe(9)    


})


test("排队任务执行超时处理",async ()=>{
    class A {      
        value:number = 0
        @queue({
            timeout:5
        })
        async go(value:number){ 
            this.value = value
            await delay(100)
        } 
    }
    let count = 10 
    let a1 = new A()  

    let task = a1.go(1) as unknown as QueueTask
    await task.done()
    expect(a1.value).toBe(1)  
    expect(task.returns).toBeInstanceOf(Error)
    expect(task.returns.message).toBe("TIMEOUT")
})



test("执行任务采用优先级函数",async ()=>{
    let tasks = [] , count = 8 
    let priorityThis
    class A {      
        values:number[] = []
        @queue({
            priority:function(tasks:QueueTask[]):QueueTask[]{
                priorityThis = this
                return tasks.sort((task1,task2) =>{
                    return task2.args[0] - task1.args[0]  
                })
            }
        })
        async go(value:number){ 
            this.values.push(value)
            await delay(10)
        } 
    }
    let a1 = new A() 
    let args = [1,2,3,4,5,6,7,8]
    for(let i = 0; i < count;i++){
        tasks.push(a1.go(args[i]) as unknown as QueueTask)
    } 

    let manager = queue.getManager() as QueueManager    
    let dispatcher = manager.getDispatcher(a1,'go')
    await dispatcher?.waitForIdle()    
    expect(priorityThis).toBe(a1)
    expect(a1.values.length).toBe(8)   
    expect(a1.values).toStrictEqual([8,7,6,5,4,3,2,1])


})



test("执行任务采用对象参数中值作为优先级",async ()=>{
    // 仅在第一个参数是{}时生效
    let tasks = [] , count = 8 
    let manager = queue.getManager() as QueueManager    
    class A {      
        values:number[] = []
        priority:string = "level"
        getDecoratorOptions(options:QueueOptions){
            options.priority =  this.priority
            return options
        }
        @queue({
            priority:"level"
        })
        async go(value:Record<string,any>){ 
            this.values.push(value.level)
            await delay(10)
        } 
    }
    let a1 = new A() 
    let args = [1,2,3,4,5,6,7,8]

    // 升序
    a1.priority = "level"
    for(let i = 0; i < count;i++){
        tasks.push(a1.go({level:args[i]}) as unknown as QueueTask)
    } 

    let dispatcher = manager.getDispatcher(a1,'go')
    await dispatcher?.waitForIdle()    
    expect(a1.values.length).toBe(8)   
    expect(a1.values).toStrictEqual([1,2,3,4,5,6,7,8])

    // 降序
    a1.values = []
    a1.priority = "-level"

    for(let i = 0; i < count;i++){
        tasks.push(a1.go({level:args[i]}) as unknown as QueueTask)
    } 
    dispatcher = manager.getDispatcher(a1,'go')
    await dispatcher?.waitForIdle()    
    expect(a1.values.length).toBe(8)   
    expect(a1.values).toStrictEqual([8,7,6,5,4,3,2,1])

})

