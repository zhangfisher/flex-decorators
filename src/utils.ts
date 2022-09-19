
export async function delay(ms:number=0) {
    if(ms<=0) return 
    return new Promise(resolve=>setTimeout(resolve,ms))
}


export type AsyncFunction = (...args:any[]) =>Promise<any>

export type FlexArguments<T>=T | Function

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
    return async function (){
        return await fn(...params)
    }
}