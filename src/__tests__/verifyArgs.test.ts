import { expect, test, beforeEach,beforeAll } from 'vitest'
import { delay } from "flex-tools"
import {
    verifyArgs
} from "../decorators/verifyArgs"

 

beforeEach(()=>{
    
})

beforeAll(()=>{     
})

test("使用函数进行参数校验",async ()=>{
    class A {      
        values:number[] = []
        @verifyArgs((args:any[]) =>{
            args[0]++
            return args
        })
        async goAsync(value:number){ 
            return value        
        }
        @verifyArgs((args:any[]) =>{
            args[0]++
            return args
        })
        go(value:number){ 
            return value        
        }
    }
    let a1 = new A()  
    let value  = a1.go(1) 
    expect(value).toBe(2)
    value  = await a1.goAsync(1) 
    expect(value).toBe(2)
})
  
test("使用默认对象参数",async ()=>{
    class A {      
        values:number[] = []
        @verifyArgs({
            id:1,
            count:1
        })
        async goAsync(message:{}){ 
            return message        
        }
        @verifyArgs({
            id:1,
            count:1
        })
        go(message:{}){ 
            return message        
        }
    }
    let a1 = new A()  
    let value  = a1.go({count:2}) 
    expect(value).toStrictEqual({id:1,count:2})
    value  = await a1.goAsync({count:3}) 
    expect(value).toStrictEqual({id:1,count:3})
})
  

test("参数校验失败",async ()=>{
    class A {      
        args:any  
        @verifyArgs(function(this:any,args:any[]){
            this.args = args
            return false
        })
        async goAsync(name:string,value:number){ 
            return value
        }
        @verifyArgs(function(this:any,args:any[]){
            this.args = args
            return false
        })
        go(name:string,value:number){ 
            return name        
        }
    }
    let a1 = new A()  
    try{
        a1.go("a",1) 
    }catch(e){
        expect(a1.args).toStrictEqual(["a",1])
        expect(e).toBeInstanceOf(TypeError)
    }
    try{
        await a1.goAsync("b",1) 
    }catch(e){
        expect(a1.args).toStrictEqual(["b",1])
        expect(e).toBeInstanceOf(TypeError)
    }
 
})
  
