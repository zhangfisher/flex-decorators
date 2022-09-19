import {delay,applyParams,AsyncFunction,FlexArguments} from "./utils";
import {throttle as throttleFor,debounce as debounceFor} from 'throttle-debounce';

/**
 *
 * 包装函数，使具备重试、超时特性
 *  reliable(fn,{参数},函数参数)
 *
 *  wrapperedfn= reliable(fn,{},a,b)
 *
 *  wrapperedfn() ===  wrapper(fn(a,b))
 *
 *
 */
 type reliableOptions={
    timeout         : number,                            // 执行失败超时,默认为1分钟
    retryCount      : number,                            // 重试次数
    retryInterval   : number,                            // 重试间隔
    debounce        : number,                            // 去抖动
    throttle        : number,                            // 节流
    noReentry       : boolean,                           // 不可重入
 }
export function reliable(fn:AsyncFunction,options:reliableOptions):Function{
    let opts = Object.assign({
        timeout         : 0,                            // 执行失败超时,默认为1分钟
        retryCount      : 0,                            // 重试次数
        retryInterval   : 1000,                     // 重试间隔
        debounce        : 0,                            // 去抖动
        throttle        : 0,                            // 节流
        noReentry       : false                         // 不可重入
    },options)
    if(opts.timeout===0 && opts.retryCount===0 && opts.debounce===0 && opts.throttle===0) return fn
    //
    let wrappedFn = applyParams(fn,...[...arguments].slice(2))

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
        wrappedFn = debounceFor(opts.debounce, wrappedFn, { atBegin: true }) as unknown as AsyncFunction
    }
    // 节流
    if(opts.throttle>0 ){
        wrappedFn = throttleFor(opts.throttle,wrappedFn,{noTrailing:true}) as unknown as AsyncFunction
    }
    return wrappedFn
}

export function throttle(fn:AsyncFunction,options:{interval:number,noLeading?:boolean,noTrailing?:boolean,debounceMode?: boolean}={interval:0,noTrailing:false}) {
    return throttleFor(options.interval,fn,options)
}

export function debounce(fn:AsyncFunction,options:{interval:number,atBegin:boolean}={interval:0,atBegin:true}){
     return debounceFor(options.interval,fn,options)
}

export const noReentry  = function (fn:Function) {
    let running = false
    return async function (this:any) {
        if (running) return
        running = true
        try{
            return await fn.apply(this, arguments);            
        }finally{
            running = false
        }         
    }
}

 
/**
 * 包装一个异步函数，使之具备超时能力
 * 当执行超过times时会触发异常
 * @param fn
 * @param options  可以是一个函数，也可以是{value:<超时值>,default:<超时返回的均默认值>}
 * @return {function(): unknown}
 */
export function timeout(fn:AsyncFunction, options:{value?:number,default?:any}={}){    
    if(options.value===0) return fn
    return async function(){
        return await new Promise((resolve,reject)=>{
            let timer = setTimeout(()=>{
                if(options.default===undefined){
                    reject(new Error("TIMEOUT"))
                }else{
                    resolve(options.default)
                }
            },options.value)
            fn(...arguments).then((result:any)=>{
                clearTimeout(timer)
                resolve(result)
            }).catch((e:Error)=>{
                clearTimeout(timer)
                reject(e)
            })
        })
    }
}

/**
 *  重试执行
 *   当执行fn出错(throw new Error)时尝试重试执行
 *   如果fn throw的错误类名是以Signal结尾的除外
 *   特殊情况：
 *   触发以Signal结尾的错误对象代表了传递某种信号，而不是真正的错误，因此不需要重试执行
 *   之所以有这样的考虑，是因为在些场合，我们约定当函数执行时可以通过Tthrow new XXXSignal的方式来向上传递信号，不被视为错误
 * 
 *
 * @param fn
 * @param options
 */
export function retry(this:any,fn:Function, options:FlexArguments<{count:number,interval?:number,default?:any}>={count:3,interval:1000}){
    const self = this
    return async function(){
        let {count,interval=1000,default:defaultValue} =typeof(options)==="function" ?  options.call(self) : options
        let error
        for(let i=0;i<count;i++){
            try{
                return await fn.call(self, ...arguments)
            }catch (e:any) {
                // 如果函数触发一个以Signal结尾的错误，则代表这不是一个一错误，而是一个向上传递的信号，不需要再进行重试
                if(e.constructor.name.endsWith("Signal")){
                    throw e
                }else{
                    error = e
                }
            }
            // 最后一次执行时不需要延时,如果执行没有错误也不需要执行
            if((i<count-1 && interval>0 && error) || !error ) {
                await delay(interval)
            }
        }
        if(defaultValue===undefined && error){
            throw error
        }else{
            return defaultValue
        }
    }
}




