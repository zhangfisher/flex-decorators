import { defineConfig } from 'tsup'

export default defineConfig({
    entry: [
        'src/*.ts',
        'src/decorators/*.ts',
        'src/wrappers/*.ts'
    ],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake:false,  
    banner: {
        js: `/**
*        
*   ---=== FlexDecorators ===---
*   https://zhangfisher.github.com/flex-decorators
* 
*   提供功能与包装逻辑分离的动态装饰器开发实践
*
*/`}
}) 