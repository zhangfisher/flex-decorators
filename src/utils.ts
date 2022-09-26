import type { AsyncFunction } from "./types"
 
export async function delay(ms:number=0) {
    if(ms<=0) return 
    return new Promise(resolve=>setTimeout(resolve,ms))
}


/**
 * 获取指定对象的所有包含原型链上的所有属性列表 * 
 * @param obj 
 * @returns 
 */
 export function getPropertyNames(obj: any) {
    const propertyNames: string[] = [];
    do {
        propertyNames.push(...Object.getOwnPropertyNames(obj));
        obj = Object.getPrototypeOf(obj);
    } while (obj);
    // get unique property names
    return Array.from(new Set<string>(propertyNames));
} 

export function hasOwnProperty(instance: any, propertyName: string) :boolean{
    return getPropertyNames(instance).includes(propertyName);
}

export function isFunction(obj: any):boolean {
    return typeof(obj)=='function'
}

export function isClass(cls: any):boolean {
    let result = false
    if (typeof(cls) === 'function' && cls.prototype) {
        try {
            cls.arguments && cls.caller;
        } catch(e) {
            result=true
        }
    }
    return result;
}


/**
 * 提供对象中的指定健值
 * @param obj 
 * @param keys 
 */
export function pick<T>(obj:Record<string,any>,keys:string[]):T {
    let result:Record<string,any> = {}
    keys.forEach(key => result[key] = obj[key])
    return result as T
}

/**
 * 以baseObj为基准判断两个对象值是否相同，值不同则返厍
 * 
 * 以baseObj为基准的意思是，只对refObj中与baseObj相同键名的进行对比，允许refObj存在不同的键名
 * 
 * @param baseObj 
 * @param refObj 
 * @param isRecursion  当isDiff被递归调用时置为true
 * @returns {Boolean} 
 */

export function isDiff(baseObj:Record<string,any> | [], refObj:Record<string,any> | [],isRecursion:boolean=false):boolean{ 
    if(typeof(baseObj)!= typeof(refObj)) return true    
    if(Array.isArray(baseObj) && Array.isArray(refObj)){
        if(baseObj.length!=refObj.length) return true  // 长度不同
        for(let i:number = 0; i < baseObj.length;i++){
            let v1 = baseObj[i], v2 = refObj[i]                
            if(typeof(v1)!=typeof(v2)) return true   // 类型不同
            if(Array.isArray(v1) && Array.isArray(v2)){
                if(isDiff(v1,v2,true)) return true    
            }else if(typeof(v1)=="object" && typeof(v2)=="object"){
                if(isDiff(v1,v2,true)) return true 
            }else{
                if(v1!=v1) return true
            }            
        }
    }else if(typeof(baseObj)=="object" && typeof(refObj)=="object"){
        if(isRecursion){
            if(Object.keys(baseObj).length != Object.keys(refObj).length) return true 
        }else{
            if(Object.keys(baseObj).length > Object.keys(refObj).length) return true 
        }
        for(let [key,value] of Object.entries(baseObj)){
            const v1 = value,v2 = (refObj as Record<string,any>) [key]
            if(!(key in refObj)) return true
            if(typeof(v1) != typeof(v2)) return true        
            if(Array.isArray(v1) && Array.isArray(v2)){
                if(isDiff(v1,v2,true)) return true    
            }else if(typeof(v1)=="object" && typeof(v2)=="object"){
                if(isDiff(v1,v2,true)) return true                            
            }else{
                if(v1 != v2) return true
            }
        }                      
    }     
    return false
}


/**
 *
 * 包装一个函数使之调用指定的参数
 *
 *  function myfunc(a,b){...}
 *  wrapedFunc = applyParams(myfunc,a,b)
 *  wrapedFunc() === myfunc(a,b)
 *
 * @param fn
 * @return {function(): *}
 */
export function applyParams(fn:AsyncFunction,...params:any[]):AsyncFunction{
    if(params.length===0) {
        return fn
    }
    return async function (this:any){
        return await fn.call(this,...params)
    }
}

/**
 * 首字符大写
 * @param str 
 */
export function firstUpperCase(str:String):string{
    return str[0].toUpperCase()+str.substring(1)
}