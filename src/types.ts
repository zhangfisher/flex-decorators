
export type AsyncFunction = (...args:any[]) =>Awaited<Promise<any>>

export type FlexArguments<T>=T | Function

export type AllowNull<T> = T | null | undefined

export type Constructor = { new (...args: any[]): any };
export type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void; 

export type LimitReturnFunction<T> = (...args: any)=>T