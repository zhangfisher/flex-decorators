import { expect, test, beforeEach } from 'vitest'
import { delay } from "../src/utils"
import {
    queue,IQueueDecoratorOptionsReader,QueueTask,QueueManager
} from "../src/decorators/queue"

 

beforeEach(()=>{
    
})

test("排队执行",async ()=>{
    class A {      
        values:number[] = []
        @queue()
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

    await Promise.all(tasks.map(task=>task.wait()));
    expect(a1.values).toStrictEqual(new Array(count).fill(0).map((v,i) =>i))

})
 
test("排队执行溢出",async ()=>{
    class A {      
        values:number[] = []
        @queue({overflow:"discard"})
        async goDiscard(value:number){ 
            this.values.push(value)
            await delay(20)
        }
        @queue({overflow:"overlap"})
        async goOverlap(value:number){ 
            this.values.push(value)
            await delay(20)
        }
        @queue({overflow:"slide"})
        async goSlide(value:number){ 
            this.values.push(value)
            await delay(20)
        }
    }
    let a1 = new A()  
    let count = 20,tasks:QueueTask[] = []
    for(let i = 0; i < count;i++){
        tasks.push(a1.goDiscard(i) as unknown as QueueTask)
    }

    let manager = queue.getManager()
    // 等待执行队列空
    await manager.getQueueExecutor(a1,'goDiscard').waitForEmpty()


    await Promise.all(tasks.map(task=>task.wait()));
    expect(a1.values).toStrictEqual(new Array(count).fill(0).map((v,i) =>i))

},999999)
 