/**
 * 
 * 排队调用被装饰的方法
 

 */
 import { createDecorator } from "../decorator"
 import type {DecoratorOptions} from "../decorator"
 import {DecoratorManager, DecoratorManagerOptions, IDecoratorManager } from "../manager"
 
 export interface CacheOptions extends DecoratorOptions {
    expires?  : number                  // 过期时间，,以ms为单位，过期缓存失效
    // 缓存键，支持插值变量,{method}=方法名称,{args}=参数hash值，或者取第n个参数{1},{2},...,{3},
    // 如果参数是一个且是一个object,也支持{#xxx}代表arguments[0].xxx
    key?:string | 'auto'
 }
export interface IGetCacheDecoratorOptions {
     getCacheDecoratorOptions(options:CacheOptions,methodName:string | symbol,decoratorName:string):CacheOptions
}
 
export const cache = createDecorator<CacheOptions,number>("cache",
     {
         expires:0,                     // 生存期,以ms为单位，当超过时间后指点
         enable:true,                      
         key:'auto'
     },{
         wrapper: function(method:Function,options:CacheOptions,manager?:IDecoratorManager):Function{
             return function(){
                return method
             }             
         }, 
         defaultOptionKey:"expires"
     })
 
 
 export interface CacheManagerOptions extends DecoratorManagerOptions{
     size?: number;          // 队列大小
 }
 
 class CacheManager extends DecoratorManager{
     async start(){
        console.log("---start")
     }
     async stop(){
        console.log("---stop")
     }
 }
 
 
//  export const cacheManager = createManagerDecorator<CacheManager,CacheManagerOptions>(
//      "cache",
//      CacheManager,
//      {
//          enable:true,
//          size:10
//      }
//  )
 
 
 
 
 
 
 