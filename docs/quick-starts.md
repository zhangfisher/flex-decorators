# 快速入门

本例以开发一个`@Cache`装饰器为例来介绍如何使用`FlexDecorators`快速方便地开发一个装饰器,体验`FlexDecorators`为您带来的方便和强大。

## 功能概要

设想中的`@Cache`装饰器可以实现：

- 能对类函数的执行结果进行缓存
- 使函数传入参数进行Hash后作为缓存键
- 支持各种缓存后端

## 第一步：创建装饰器

```typescript
import { createDecorator  } from "flex-decorators"


export cache = createDecorator("cache",{})

```





