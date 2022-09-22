/**
 * 
 * 排队调用被装饰的方法
 

 */
 import { createDecorator } from "../methods"
 import type {DecoratorOptions} from "../methods"
 import type {AsyncFunction } from "../types"
 import {DecoratorManager, createManagerDecorator,DecoratorManagerOptions } from "../manager"
 
 export interface CacheOptions extends DecoratorOptions {
    enable?: boolean
    ttl?  : number                    // 队列大小
    default?: any                       // 如果提供则返回该默认值而不是触发错误
 }
 export interface IGetCacheDecoratorOptions {
     getCacheDecoratorOptions(options:CacheOptions,methodName:string | symbol,decoratorName:string):CacheOptions
 }
 
 export const cache = createDecorator<CacheOptions>("cache",
     {
         ttl:0,      
         enable:true,                      
         default:null
     },{
         wrapper: function(method:Function,options:CacheOptions,manager:DecoratorManager):Function{
             return function(){
                return method
             }
             
         },
         proxyOptions:true,
         defaultOptionKey:"size"
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
 
 
 export const cacheManager = createManagerDecorator<CacheManager,CacheManagerOptions>(
     "cache",
     CacheManager,
     {
         enable:true,
         size:10
     }
 )
 
 
 
 
 
 
 