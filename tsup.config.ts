import { defineConfig } from 'tsup'


const banner =`/**
*        
*   ---=== FlexDecorators ===---
*   https://zhangfisher.github.com/flex-decorators
* 
*   提供功能与包装逻辑分离的动态装饰器开发实践
*
*/`

export default defineConfig([
    {
        entry: [
            'src/index.ts', 
            'src/decorators/*.ts'
        ],            
        format: ['cjs', 'esm'],
        noExternal:["flex-tools"],
        dts: true,
        splitting: true,
        sourcemap: true,
        clean: true,
        treeshake:true,   
        banner: {js: banner}
    }
]) 