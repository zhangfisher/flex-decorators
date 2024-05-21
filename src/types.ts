export type Constructor = { new (...args: any[]): any };
// 装饰器
export type TypedClassDecorator<T> = <T extends Constructor>(target: T) => T | void; 


