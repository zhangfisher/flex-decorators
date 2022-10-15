# 工具库

`flex-decorators`内置了一些有用的工具库可以直接使用。

## asyncSignal

开发中经常碰到需要在某些异步任务完成后做点什么的场景，，`asyncSignal`用来创建一个异步信号，可以侦听该异步信号的`resolve/reject`，其本质上是对`Promise`的简单封装。

**以下用一个例子来说明如何使用`asyncSignal`：**

```typescript
import {asyncSignal,IAsyncSignal} from "flex-decorators/asyncSignal";
let signal = asyncSignal()

class Dispather{
    signal:IAsyncSignal
    constructor(){
        this.signal =  asyncSignal()
    }
    async start(){

    }


}







```


### 使用










## liteEventEmitter