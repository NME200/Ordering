# Web-shared · Ordering 前端共享源码包

Admin-web / Merchant-web / Cashier-web **三端共用**的前端基础层与业务视图。

## 为什么是「源码包」而不是普通 npm 包

本包**不构建、不安装依赖**：各前端通过 `tsconfig paths` + Vite `alias` 以
`@shared/*` 直接引用 `src` 下的源码。原因：

1. 包里有 `.vue` 文件。若作为普通 node_modules 依赖，Vite 会尝试预打包它，
   SFC 编译与 HMR 都会出问题；
2. 本机有 safe-delete 钩子，依赖缓存重建被拦截会直接杀掉 dev server ——
   少一个需要预打包的依赖就少一份风险。

代价是**裸导入需要各端配合解析**（见下方「接入约定」）。

## 目录结构

```
src/
├── api/          # 接口定义（按业务域拆分）
├── components/   # 通用组件：PageHeader / StatusTag / TableEmpty / TablePagination / ErrorPage
├── hooks/        # useListQuery（列表分页/查询/重置）
├── session/      # 共享视图与宿主工程之间的会话契约
├── styles/       # 设计令牌 + Element Plus 主题覆盖 + 基础样式
├── types/        # 类型与枚举（与后端 DTO / 枚举严格对齐）
├── utils/        # request / auth / format / permission
└── views/        # 业务列表页（门店 / 员工 / 菜品分类 / 菜品 / 规格组）
```

## 接入约定（新端接入时必读）

### 1. 别名与解析

```ts
// vite.config.ts
resolve: {
  alias: {
    // ⚠️ @shared 必须排在 @ 之前，否则 '@shared/x' 会被 '@' 规则匹配成 '<src>shared/x'
    '@shared': fileURLToPath(new URL('../Web-shared/src', import.meta.url)),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  // 共享包自身没有 node_modules，它的裸导入必须解析到本项目的依赖
  dedupe: ['vue', 'vue-router', 'pinia', 'axios', 'element-plus', '@element-plus/icons-vue'],
},
server: {
  // dev server 需要读取项目目录之外的共享源码
  fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
},
```

```jsonc
// tsconfig.json
"paths": {
  "@shared/*": ["../Web-shared/src/*"],
  "@/*": ["./src/*"],
  "vue": ["./node_modules/vue"],
  "vue-router": ["./node_modules/vue-router"],
  "pinia": ["./node_modules/pinia"],
  "axios": ["./node_modules/axios"],
  "element-plus": ["./node_modules/element-plus"],
  "element-plus/*": ["./node_modules/element-plus/*"],
  "@element-plus/icons-vue": ["./node_modules/@element-plus/icons-vue"]
},
"include": ["src/**/*", "../Web-shared/src/**/*.ts", "../Web-shared/src/**/*.vue", "vite.config.ts"]
```

> `paths` 里那几个裸包映射不能省：TS 与 Vite 都从**导入方所在目录**向上找 node_modules，
> 而共享包位于各工程之外，向上找不到，会直接报
> `failed to resolve import "axios"`。

### 2. 注册会话

共享视图需要知道「当前账号能做什么」，但不能直接依赖某个工程的 Pinia store。
各工程在 `main.ts` 中注册自己的 user store：

```ts
import { registerSession } from '@shared/session';

registerSession(useUserStore()); // store 需满足 SessionContext 接口
```

### 3. 隔离令牌存储

三端可能在同一浏览器同时使用，令牌键名必须按端区分：

```ts
import { configureTokenKey } from '@shared/utils/auth';

configureTokenKey('ordering_admin_token'); // 商户端用 ordering_merchant_token，收银端用 ordering_cashier_token
```

## 维护约定

- **共享包内的导入一律用相对路径**，不要用 `@shared/*` 或 `@/*`（保持包自包含）。
- 新增 Element Plus 组件时，**三端的 `optimizeDeps.include` 都要补**对应的 `style/css` 入口
  （各端用到的组件集合可能不同）。
- 只放「三端确实需要」的东西。某一端专有的页面（登录页、工作台、个人中心）留在各自工程里。
- 修改 `types/` 时注意与后端 `ordering-serve/src/shared/enums` 保持一致。
