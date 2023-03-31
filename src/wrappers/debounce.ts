import { debounce as debounceFor} from 'throttle-debounce';
import type { AsyncFunction } from "flex-tools";
 
export default function debounce(fn:AsyncFunction,options:{interval:number,atBegin?:boolean}={interval:0,atBegin:true}){
    return debounceFor(options.interval,fn,options)
}

