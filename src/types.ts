
export type AsyncFunction = (...args:any[]) =>Promise<any>

export type FlexArguments<T>=T | Function

export type AllowNull<T> = T | null | undefined