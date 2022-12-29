import type { AsyncFunction } from "../types";
import { noReentry,timeout,retry,memorize,applyParams } from "flex-tools"
import debounce from "./debounce"
import throttle from "./throttle"
/**
 *
 * 包装函数，使具备重试、超时特性
 *
 */

type reliableOptions={
    timeout         : number,                            // 执行失败超时,默认为1分钟
    retryCount      : number,                            // 重试次数
    retryInterval   : number,                            // 重试间隔
    debounce        : number,                            // 去抖动
    throttle        : number,                            // 节流
    noReentry       : boolean,                           // 不可重入
    memorize        :  ((args: any[]) => string) | 'length' | boolean
}

export default function reliable(fn:AsyncFunction,options:reliableOptions):AsyncFunction{
    let opts = Object.assign({
        timeout         : 0,                            // 执行失败超时,默认为1分钟
        retryCount      : 0,                            // 重试次数
        retryInterval   : 1000,                         // 重试间隔
        debounce        : 0,                            // 去抖动
        throttle        : 0,                            // 节流
        noReentry       : false,                        // 不可重入
        memorize        : false
    },options)
    
    if(opts.timeout===0 && opts.retryCount===0 && opts.debounce===0 && opts.throttle===0 && opts.noReentry==false) return fn
    //
    let wrappedFn = applyParams(fn,...[...arguments].slice(2)) as AsyncFunction
    // 不可重入 
    if(opts.noReentry){
        wrappedFn = noReentry(wrappedFn)
    }    
    // 启用超时功能
    if(opts.timeout > 0){
        wrappedFn = timeout(wrappedFn,{value:opts.timeout})
    }
    // 启用重试功能
    if(opts.retryCount > 0 && opts.retryInterval >= 0 ){
        wrappedFn = retry(wrappedFn,{count: opts.retryCount, interval:opts.retryInterval},)
    }
    // 防抖动
    if(opts.debounce>0){
        wrappedFn = debounce(wrappedFn, {interval:opts.debounce, atBegin: true }) as unknown as AsyncFunction
    }
    // 节流
    if(opts.throttle>0 ){
        wrappedFn = throttle(wrappedFn,{interval:opts.throttle, noTrailing:true}) as unknown as AsyncFunction
    }

    if(opts.memorize!==undefined && opts.memorize!==false) {
        wrappedFn = memorize(fn, {hash:opts.memorize}) as AsyncFunction
    }

    return wrappedFn
}
