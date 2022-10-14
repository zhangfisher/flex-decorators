# 指南
## 创建装饰器

`createDecorator`用来创建一个装饰器,创建装饰器的基本步骤如下：

### 声明装饰器参数

大部份的装饰器均具有若干参数，`flex-decorators`约定，所有装饰器参数均使用`{}`形式声明。
我们首先要声明一个装饰器参数，装饰器参数应该继承自`DecoratorOptions`

```typescript
import { DecoratorOptions,createDecorator  } from "flex-decorators"

export interface CacheOptions extends DecoratorOptions{
    // 此处就是装饰器的参数
}
```

### 创建装饰器

使用`createDecorator`来创建装饰器。

>**注意**：使用`createDecorator`来创建的装饰器只能被用来装饰类方法.

`createDecorator`方法函数签名如下：

```typescript
function createDecorator<T extends DecoratorOptions,METHOD=any,D=any>(
    decoratorName:string,
    defaultOptions?:T,
    opts?:createDecoratorOptions<T,METHOD>
): DecoratorCreator<T,METHOD,D>
```
**`createDecorator`方法具有三个泛型类型：**
-    `OPTIONS`: 装饰器参数
-    `METHOD`: 被装饰的函数签名
-    `DEFAULT_OPTION`: 默认装饰器参数值类型

**`createDecorator`方法具有三个参数：**

-    `decoratorName`: 装饰器名称,一般应避免冲突
-    `defaultOptions`: 默认的装饰器参数,要尽可能为所有参数提供默认值
-    `opts`: 创建装饰器控制参数

## 装饰器参数

大部份的装饰器均具有若干配置参数，`flex-decorators`规定装饰器参数类型应该继承自`DecoratorOptions`，如下：

```typescript
import { DecoratorOptions,createDecorator  } from "flex-decorators"
export interface CacheOptions extends DecoratorOptions{
    // 此处就是装饰器的参数
}
```
`DecoratorOptions`声明如下：
```typescript
export interface DecoratorOptions {
    id?: string | number;  
    enable?: boolean                            // 是否启用或关闭装饰器
}
```

- 每一个装饰器均具有一个用来标识的`id`。默认情况下，`id`值等于被装饰的方法名，也可以重载。
- `enable`参数用来控制装饰器是否生效，如果`enable=false`装饰功能无效。

## 动态读取装饰器参数

普通的装饰器配置参数一般是静态的，而在实际应用场景中，经常存在需要动态读取装饰器参数的，`flex-decorators`提供了一套从当前实例中读取装饰器参数的机制。

还是以``快速入门``中的例子，我们需要从当前类实例中读取缓存装饰器参数,主要有两种方法：

- **实现`ICacheDecoratorOptionsReader`接口**

我们在`cache.ts`中声明一个`ICacheDecoratorOptionsReader`接口，如下：

```typescript
export interface ICacheDecoratorOptionsReader {
    getCacheDecoratorOptions:((options:CacheOptions,methodName:string | symbol,decoratorName:string)=>CacheOptions) 
    | ((options:CacheOptions,methodName:string | symbol,decoratorName:string)=>Promise<CacheOptions>)
}
```

然后在目标类中实现该接口

```typescript

class App implements ICacheDecoratorOptionsReader{
    getCacheDecoratorOptions(options:CacheOptions,methodName:string | symbol,decoratorName:string):CacheOptions{
        if(methodName=='getUsers'){
            options.ttl = 100
        }else{
            options.ttl = 200
        }        
        return options
    }
    @cache()
    getUsers(){  }

    @cache()
    getDepts(){  }
}
```
当调用类的被`@cache`装饰的方法时，会调用`getCacheDecoratorOptions`方法，可以在此方法返回装饰器参数。`getCacheDecoratorOptions`方法传入`methodName`，因此就可根据不同的方法来动态提供装饰器参数
 
- **实现`IDecoratorOptionsReader`接口**

`ICacheDecoratorOptionsReader`只是针对`@cache`装饰器，而`IDecoratorOptionsReader`接口则可以适用于所有装饰器。

```typescript
class App implements IDecoratorOptionsReader{
    getDecoratorOptions(options:CacheOptions,methodName:string | symbol,decoratorName:string):CacheOptions{
        if(decoratorName=='cache'){
            if(methodName=='getUsers'){
                options.ttl = 100
            }else{
                options.ttl = 200
            }        
        }        
        return options
    }
    @cache()
    getUsers(){  }

    @cache()
    getDepts(){  }
}
```

> 如果同时实现了装饰器`ICacheDecoratorOptionsReader`和`IDecoratorOptionsReader`,则`ICacheDecoratorOptionsReader`生效。

## 装饰器异步包装问题
 
装饰器最本质的功能是对原始方法进行包装返回一个新的方法，一般情况下，装饰器即可以被用来装饰同步函数，也可以用来装饰同步函数。
理想情况下，应该尽可能保持被装饰方法的函数类型，当被装饰方法是同步方法时，包装后的方法应该是同步方法，当被装饰方法是异步方法时，包装后的方法也应该是异步方法.
但是受限于装饰器本身要实现的功能以及`async/await`函数的传染性问题的约束， 装饰器可能会采取不同的包装策略。

- 在快速入门例中，`cacheManager`的`get/set`方法均是异步方法，这就决定了被`@cache`装饰的方法只能包装为`async`函数才可以正确工作。这是由装饰器本身要实现的功能决定的。
- 有些情况下，通过`ICacheDecoratorOptionsReader`和`IDecoratorOptionsReader`这两个接口方法动态读取装饰器参数时，需要这两个接口是异步布方法（比如从数据库/HTTP中读取）。由于`async/await`函数的传染性问题,这就要求被装饰的方法也必须包装为异步方法才能正常工作。

为了解决以上问题，`flex-decorators`通过`asyncWrapper`参数来控制装饰器函数的包装策略。

`asyncWrapper`参数取值：`true | false | 'auto'(默认)`

- 当`asyncWrapper='auto'`时，`flex-decorators`会根据被包装方法和`ICacheDecoratorOptionsReader`和`IDecoratorOptionsReader`这两个接口方法来自动决定包装为同步或者异步方法。只要其中有一个方法是异步方法，`flex-decorators`就会将被包装方法包装为异步方法。
- 但是`asyncWrapper='auto'`并不总是能正确工作，比如在`快速入门`的例子中，如果`getData`和`getCacheDecoratorOptions`均是同步方法，则按照`asyncWrapper='auto'`策略，`getData`方法将被包装为同步方法，但是明显`Cache`操作是个异步行为，这不能符合预期，因此需要通过`asyncWrapper=true`明确告诉装饰器需要将被装饰的方法包装为异步方法。

> 因此，当装饰器功能涉及到异步操作时，一般应该配置`asyncWrapper=true`.


## 装饰器管理器

### 概念

装饰器的功能是对原始方法进行包装并返回一个新的方法,其本质是在函数执行前或执行后注入一些应用逻辑，一般情况下，如果这些逻辑比较简单，可以直接在闭包环境和包装函数中写逻辑代码，如下：
```typescript
export const memorize = createDecorator("memorize",{},{
    wrapper: function(method:Function,options:RetryOptions):Function{
        let results 
        return function(this:any,...args:any[]){
            if(results===undefined){
                results=method.apply(this,arguments)
            }
            return results
        }
    }
})
```
以上`memorize`装饰器逻辑比较简单，所以将执行的结果直接保存在闭包上下文中即可。
但是并不是所有所有装饰器的功能逻辑均这么简单，例如`快速入门`的例子中的缓存控制逻辑就比较复杂，此情况下，一般不推荐在包装函数中直接编写装饰器的功能逻辑，而应该将装饰器的功能逻辑分离出来。
> **最佳实践**：装饰器的功能逻辑与包装逻辑分离

基于以上考虑，`flex-decorators`引入了装饰器管理器`DecoratorManager`的概念，我们推荐开发者在开发具备一定复杂度的装饰器时，采用`DecoratorManager`机制来实现装饰器的功能逻辑.


### 创建装饰器管理器

自定义的装饰器管理器应该继承自`DecoratorManager`

```typescript
import { DecoratorManager, DecoratorManagerOptions  } from "flex-decorators"

interface CusotmManagerOptions extends DecoratorManagerOptions{
    // 此处是管理器配置参数
} 
class CustomDecoratorManager extends DecoratorManager{
    constructor(decoratorName:string, options:CusotmManagerOptions){
        //
    }
    async onStart(){
        // 此处启动逻辑
    }
    async onStop(){
        // 此处停止清理逻辑
    }    
}
``` 

接下来需要在创建装饰器时传入`manager`参数，用来告诉装饰器应该使用哪一个装饰器管理器。

```typescript
import { createDecorator  } from "flex-decorators"

export myDecorator= createDecorator("myDecorator",{
   // 装饰器默认参数
},{
    wrapper: function(method:Function,options:CacheOptions,manager?:DecoratorManager){
        //...
    },
    manager:CustomDecoratorManager
})
```

`manager`参数类型如下：

```typescript

export type DecoratorManagerCreateFinalOptions = {
    // 是否启动装饰器管理器，当第一次调用时会实例化管理器，如果=false，则管理器需要由开发者自行初始化并启动
    autoStart?:boolean          
    // 决定什么时候实例化管理器,once=立刻实例化, demand=按需实例化, 
    initial?:'demand' | 'once' | 'manual'
    // 管理器类 / 管理器实例 
    creator?:DecoratorManager | Function | typeof DecoratorManager    
    // 传递给管理器实例的默认构造参数
    defaultOptions?:Record<string,any>              
}

````

**说明:**

- `initial`默认值是`demand`，即按需自动实例化管理器，当首次调用被对应装饰器装饰的方法时自动实例化装饰器，如果`autoStart=true`,则同时自动启动该管理器。


### 启动与停止装饰器管理器

上述说明装饰器管理器负责实现装饰器的功能逻辑，因此需要一个启动与停止的过程：

- 一般在启动时进行初始化工作，比如在缓存管理器中可以连接到redis等。
- 在停止管理器时进行相应的清理工作，比如在缓存管理器中可能需要断开redis连接等。

- 默认`autoStart=true`，即实例化管理时会自动启动，如果`autoStart=false`，则应用开发者需要自行控制启动。如快速入门中的例子，需要调用`await cache.getManager().start()`，或者在类中使用`await (this as any).cacheManager.start()`。
