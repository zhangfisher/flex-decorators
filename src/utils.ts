import { deepMerge  } from "flex-tools/object/deepMerge"
import { getPropertyNames } from "flex-tools/object/getPropertyNames"
import { isPlainObject } from "flex-tools/typecheck/isPlainObject"

export function hasOwnProperty(instance: any, propertyName: string) :boolean{
    return getPropertyNames(instance).includes(propertyName);
}

export function isFunction(obj: any):boolean {
    return typeof(obj)=='function'
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
 * 将fromArray中的对应项替换toArray中的符合条件的对应项
 * 
 * - 如果toArray中的对应项是undefined则使用fromArray中的对应项替换
 * - 如果toArray中的对应项不存在使用fromArray中的对应项替换
 * - 如果toArray和fromArray中的对应项是{}，则使用fromArray中的对应项混入
 * 
 * @param toArray 
 * @param fromArray 
 */
export function mixinArray(toArray: any[],fromArray: any[]){
    fromArray.forEach((value: any,index:number) =>{
        if(index < toArray.length){
            if(toArray[index]===undefined){
                toArray[index] = value
            }else if(isPlainObject(toArray[index]) && isPlainObject(value)){
                toArray[index] = deepMerge(toArray[index],value)
            }
        }else{
            toArray.push(value)
        }
    })
    return toArray
}

export function firstUpper(str:string):string {
    return str.charAt(0).toUpperCase()+str.substring(1)
}