import {throttle as throttleFor} from 'throttle-debounce';
import type { AsyncFunction } from "../types";


export default function throttle(fn:AsyncFunction,options:{interval:number,noLeading?:boolean,noTrailing?:boolean,debounceMode?: boolean}={interval:0,noTrailing:false}) {
    return throttleFor(options.interval,fn,options)
}
