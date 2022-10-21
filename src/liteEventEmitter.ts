/**
 * 
 * 一个简单的事件触发器
 * 
 */

 export interface LiteEventEmitterOptions{
    context?: any               // 可选的上下文对象，当指定时作为订阅者的this
    ignoreError?: boolean       // 是否忽略订阅者的执行错误
    delimiter?:string           // 事件名称分割符
    [key: string]:any
 }

export class LiteEventEmitter{
    #listeners:Map<string,[Function,number][]> = new Map()
    #options:Required<LiteEventEmitterOptions>  
    constructor(options:LiteEventEmitterOptions={}){
        this.#options = Object.assign({
            ignoreError:true,
            context:null,
            delimiter:"/"
        },options) as Required<LiteEventEmitterOptions>
    }
    get options(){ return this.#options}
    get context(){ return this.options.context}
    on(event:string,callback:Function){
        if(!this.#listeners.has(event)){
            this.#listeners.set(event,[])
        }
        this.#listeners.get(event)!.splice(0,0,[callback,-1])
    }
    once(event:string,callback:Function){
        if(!this.#listeners.has(event)){
            this.#listeners.set(event,[])
        }
        this.#listeners.get(event)!.splice(0,0,[callback,1])
    }    
    off(event:string,callback:Function){
        if(!this.#listeners.has(event)) return
        let listeners = this.#listeners.get(event) || []
        for(let i=listeners.length-1;i>=0;i--) {
            if(listeners[i][0]==callback){
                listeners.splice(i,1)
            }
        }
    }
    /**
     * 等待某个事件触发后返回
     * @param event 
     */
    async wait(event:string){        
        return new Promise<void>((resolve)=>{
            this.once(event,()=>{
                resolve()
            })
        })
    }
    clear(){
        this.offAll()
    }
    offAll(event?:string){
        if(event){
            this.#listeners.delete(event)
        }else{
            this.#listeners.clear()
        }        
    }
    /**
     * 获取指定事件侦听器
     * @param event  事件名称，支持通配符*，如 
     * @returns 
     */
    getListeners(event:string):Function[]{
        let listeners = this.getEventListeners(event)
        let callbacks:Function[] = []
        for(let cbs of Object.values(listeners)){
            callbacks.push(...cbs)
        }
        return callbacks
    }
    /**
     * 获取指定事件侦听器
     * @param event  事件名称，支持通配符*，如 
     * @param event 
     * @returns   {eventName:[Function,...,Function],eventName:[Function,...,Function]}
     */
    private getEventListeners(event:string):Record<string,Function[]>{
        if(event.includes('*')){
            let listeners:Record<string,Function[]>= {}
            for(let [eventName,[[listener]]] of this.#listeners){
                if(this.isMatchedEvent(eventName,event )){
                    if(!(eventName in listeners) ) listeners[eventName] = []
                    listeners[eventName].push(listener)                        
                }
            }
            return listeners
        }else{
            type listenersType = Record<string, Function[]>
            return (this.#listeners.get(event) || []).reduce<listenersType>((results: listenersType, listenerInfo:[Function,number]) => {
                if (!(event in results)) results[event] = []
                results[event].push(listenerInfo[0])
                return results
            }, {} as  listenersType) 
        }    
    }
    /**
     * 判断event是否是否匹配toEvent，主要处理通配符
     * 
     * isMatchedEvent("a","a") == true
     * isMatchedEvent("a/b","a/*") == true
     * isMatchedEvent("a/b/c","a/* /c") == true
     * 
     * @param event 
     * @param toEvent  包含通配符的
     */
    private isMatchedEvent(event:string,toEvent:string):boolean{
        if(event==toEvent) return true
        if(toEvent.includes('*')){
            let srcEvents = event.split(this.#options.delimiter)
            let toEvents = toEvent.split(this.#options.delimiter)
            if(srcEvents.length==toEvents.length){
                if(srcEvents.every((value,index)=>value==toEvents[index] || toEvents[index]=='*')){ 
                    return true
                }
            }
        }
        return false
    }
    /**
     * - 对侦听器中counter值大于0的减一
     * - 如果计数器 =0 则移除
     * @param event 支持通配符
     */
    private _updateListenerCounter(event:string){
        for(let [eventName,listeners] of this.#listeners){
            if(this.isMatchedEvent(eventName,event)){
                for(let i = listeners.length-1; i >=0 ; i--){
                    const counter = listeners[i][1] 
                    if(counter>0){
                        listeners[i][1] --
                        if(listeners[i][1] ==0){
                            listeners.splice(i, 1)
                        }
                    }        
                }
                
            }
        }
    }
    /**
     * 遍历匹配指定事件event的侦听器
     * @param event 
     * @param callback 
     * @param updateCounter  是否更新调用计数，仅当emit时才应该设定为false
     */
    private forEachListeners(event:string,callback:Function,updateCounter:boolean=false){
        for(let [eventName,listeners] of this.#listeners){
            if(this.isMatchedEvent(eventName,event)){
                for(let i = listeners.length-1; i >=0 ; i--){                    
                    callback(eventName,listeners[i][0])
                    if(!updateCounter) continue                        
                    if(listeners[i][1]>0){
                        listeners[i][1]--
                        if(listeners[i][1] ==0){
                            listeners.splice(i, 1)
                        }
                    }
                }
            }
        }
    }
    /**
     * 返回侦听器
     * @param 
     * @param updateCounter 
     * @returns 
     */
    private mapAsyncListeners(event:string,updateCounter:boolean=false){
        let mapedListeners:Awaited<Promise<any>>[] = []        
        this.forEachListeners(event,(eventName:string,listener:Function)=>{
            mapedListeners.push(async (...args:any[])=>{
                if(this.context){
                    return await listener.apply(this.context, args)
                }else{
                    return await listener(...args)
                }
            })
        },updateCounter) 
        return mapedListeners
    }
    
    private executeListener(listener:Function,...args:any[]){
        try{
            if(this.context){
                listener.apply(this.context, args)
            }else{
                listener(...args)
            }            
        }catch(e){
            if(this.options.ignoreError==false){
                throw e
            }
        }  
    }
    
    /**
     * 触发事件，支持简单的通配符
     * 
     * '*' 代表任意字符
     * 
     */
    emit(event:string,...args:any[]):void{
        this.forEachListeners(event,(eventName:string,listener:Function)=>{
            this.executeListener(listener)
        },true)
    }
    async emitAsync(event:string,...args:any[]):Promise<(any | Error)[]>{
        let results = await Promise.allSettled(this.mapAsyncListeners(event,true)) 
        return results.map((result=>result.status =='fulfilled' ? result.value : result.reason))
    }
}