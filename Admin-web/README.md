# Admin-web · Ordering 平台管理端

多商户 SaaS 点餐系统的**平台管理端**前端。面向**平台管理员**，职责是**商户治理 + 账号治理**，
以及跨租户的**只读数据排查**。

> ⚠️ 这不是「什么都能干」的超级后台。商户的经营维护（门店、员工、菜单、订单、支付）
> 属于 Merchant-web 与 Cashier-web。平台管理员对这些资源只有只读权限，
> 且账号本身也无法登录另外两个端 —— 详见下方「端（Portal）与角色的分离」。

## 技术栈

| 项 | 选型 |
| --- | --- |
| 框架 | Vue 3（组合式 API + `<script setup>`） |
| 语言 | TypeScript（strict，禁止 `any` / `@ts-ignore`） |
| 构建 | Vite |
| UI | Element Plus（**按需引入**）+ `@element-plus/icons-vue` |
| 状态 | Pinia |
| 路由 | Vue Router（懒加载 + 权限守卫） |
| 请求 | Axios（统一封装于 `src/utils/request.ts`） |
| 包管理 | npm |

## 快速开始

```bash
# 1. 安装依赖（国内建议走镜像源）
npm install --registry=https://registry.npmmirror.com

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 类型检查 / 生产构建
npm run typecheck
npm run build
```

开发前请先启动后端 `ordering-serve`（默认 `http://localhost:3100`，接口前缀 `/api/v1`）。
开发环境通过 Vite 代理 `/api` 直连后端，因此**不依赖后端 CORS 白名单**；生产环境由反向代理保持同源。

### 环境变量

见 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 接口基础路径，默认 `/api/v1` |
| `VITE_PROXY_TARGET` | 仅开发环境：Vite 代理目标（后端地址） |
| `VITE_APP_TITLE` | 浏览器标题中的应用名 |

### 演示账号（仅开发环境在登录页展示）

| 账号 | 密码 | 角色 | 可登录的端 |
| --- | --- | --- | --- |
| `admin` | `Admin@123456` | 平台管理员 | **本工程** / — |
| `merchant01` | `Merchant@123456` | 商户管理员 | Merchant-web |
| `cashier01` | `Cashier@123456` | 收银员 | Cashier-web |

> 登录页只展示能进本工程的账号。用 `merchant01` / `cashier01` 登录会被服务端拒绝
> （`403 / 20007`「无法登录平台管理端」）—— 这是预期行为，不是 bug。

## 目录结构

```
src/
├── layouts/        # 布局（DefaultLayout + 侧边栏 / 顶栏）
├── router/         # 路由表与全局守卫
├── store/          # Pinia（modules/user：登录态与权限）
├── types/          # 本工程专有类型（env / router meta / 生成的组件声明）
├── utils/          # 本工程专有工具（icons）
└── views/          # 页面（dashboard / merchant / merchant-detail / profile / login / error）
```

> 请求封装、类型、设计令牌、通用组件、以及门店 / 员工 / 菜品 / 分类 / 规格组
> 这些**业务列表页**都在 `Web-shared/` 共享包里，通过 `@shared/*` 引入 ——
> 见 `Web-shared/README.md`。Admin-web 只保留平台端专有的页面。
>
> ⚠️ 本工程用 `resolve.dedupe` + tsconfig `paths` 把共享包的裸导入解析到自己的
> `node_modules`（共享包自身不装依赖）。新增 Element Plus 组件时记得同步
> `OPTIMIZE_DEPS`，否则 dev server 会因依赖重建被 safe-delete 钩子杀掉。

## 关键约定

### 端（Portal）与角色的分离 —— 先看这一节

本系统有**三个前端**，各自服务一类使用者：

| 端 | 工程 | 谁用 | 职责 |
| --- | --- | --- | --- |
| `admin` | **Admin-web**（本工程） | 平台管理员 | 商户治理、账号治理、跨租户只读排查 |
| `merchant` | Merchant-web | 商户管理员 / 门店管理员 | 门店、员工、菜单、订单、支付的经营维护 |
| `cashier` | Cashier-web | 收银员 | 收银与订单流转 |

**「端」和「角色」是两个正交维度，不要混为一谈：**

- **端**决定「从哪个入口登录、看到什么信息架构」，由**服务端**在登录时校验
  （`portal-map.ts` 的 `Role → Portal` 映射）。角色不属于该端 → 直接拒登（`403 / 20007`）。
  所以平台管理员登录不了商户后台，商户管理员也登录不了本工程。
- **角色**决定「拥有哪些权限点、能调哪些接口」（`permission-map.ts`）。
  平台管理员只有**治理类写权限 + 业务类只读权限**，共 14 个权限点：

  ```
  商户      merchant:create / read / update / delete
  员工账号  user:create / read / update / delete
  门店      store:read
  菜品分类  category:read
  菜品      dish:read
  规格组    spec:read
  订单      order:read
  支付      payment:read
  ```

  ⚠️ 平台管理员**没有**任何经营类的写权限（建门店、改菜单、上下架、接单、退款）。
  这是刻意的职责分离，不是遗漏 —— 不要用 `Object.values(Permission)` 之类的写法把权限表还原成全量。

前端登录时固定带上 `portal: Portal.ADMIN`（见 `store/modules/user.ts`），
服务端据此判断能否登录；**前端隐藏入口只是体验优化，拒登发生在服务端**。

### 信息架构

平台端侧边栏只放平台职责：

- **工作台**：平台口径的治理概览（商户 / 门店 / 账号 / 菜品总数）
- **商户管理**：商户生命周期（完整 CRUD），点商户名进入**商户详情**
- **账号管理**：跨商户的账号治理（开通管理员、重置密码、禁用）

**门店、菜品分类、菜品、规格组不进侧边栏** —— 它们是商户的经营资产。
需要排查时从「商户详情」页进入，那里以**只读标签页**的形式展示该商户的这些数据。

### 商户详情页与内嵌只读列表

`views/merchant-detail/index.vue` 复用了各业务列表页，通过三个 props 切换形态：

| prop | 作用 |
| --- | --- |
| `embedded` | 隐藏页头、不自带面板边框（避免卡片套卡片）、隐藏商户筛选 |
| `readonly` | 隐藏「操作」列，状态开关换成只读标签 |
| `merchantId` | 固定租户范围（优先于筛选栏），随路由参数变化自动重查 |

> 这四个列表页（门店 / 菜品分类 / 菜品 / 规格组）本质上是**商户后台的页面**。
> 目前寄居在 Admin-web 只是为了复用表格逻辑；后续做 Merchant-web 时应当迁走，
> 届时可抽成共享包或直接搬过去，Admin-web 只保留内嵌只读形态。

### 租户隔离

后端对租户范围有两套规则（见 `ordering-serve/src/common/utils/tenant.util.ts`）：

- **非平台管理员**：一律使用 Token 中的 `merchantId`，前端传什么都被忽略；
- **平台管理员**：可显式指定 `merchantId`，**不传则跨租户返回全部**。

因此前端规则是：

| 角色 | 商户筛选 / 所属商户字段 | 表格「所属商户」列 |
| --- | --- | --- |
| 平台管理员 | 显示（新增时必填） | 显示 |
| 商户管理员及以下 | 隐藏（由服务端按 Token 限定） | 隐藏 |

菜品的「所属分类」与「规格组」必须与菜品同属一个商户，否则后端返回
`DISH_CATEGORY_MISMATCH` / `SPEC_GROUP_MISMATCH`。所以菜品弹窗中切换商户时，
会清空已选分类与规格组并重新加载选项。

### 权限控制

- 权限点标识（如 `dish:update`）**前后端共用同一套**，定义在 `src/types/enums.ts`。
- 路由 `meta.permission` 声明所需权限；侧边栏按权限过滤，守卫无权限时跳 403。
- 按钮级用 `userStore.hasPermission(...)` 控制显隐。
- **前端隐藏只是体验优化，真正的安全边界在服务端接口鉴权**。

### 金额

后端一律以**整数分**传输与存储。前端只在展示与录入时通过
`src/utils/format.ts` 的 `fenToYuan` / `yuanToFen` 转换，业务代码不得自行乘除 100。

### 表格行类型

Element Plus 的 `el-table` 插槽暴露的 `row` 是宽松类型（`DefaultRow = Record<PropertyKey, any>`），
不会从 `:data` 推断实体类型。因此调用强类型处理函数时统一用 `rowAt($index)` 取回行，
而不是在模板里写类型断言。

## 已知环境问题

**本机 safe-delete 钩子会拦截 Vite 依赖优化器的缓存重建。**

Vite 在重建依赖缓存时会把旧缓存目录重命名为临时目录并批量删除；本机钩子对单次
超过 50 个文件的删除会直接抛错，导致 dev server 退出。因此 `vite.config.ts` 里用
`optimizeDeps.include` **显式声明了全部需要预打包的依赖**（含 Element Plus 各组件的
`style/css` 入口），让依赖集合从首次启动就稳定，不再触发重建。

> ⚠️ 新增 Element Plus 组件时，需要同步在 `OPTIMIZE_DEPS` 中补一行对应的 `style/css` 入口，
> 否则首次访问该页面会触发一次依赖重建。

## 待办

- **Merchant-web**（商户后台）：把 Admin-web 里的门店 / 员工 / 菜单 CRUD 页迁过去，
  补上订单与支付的经营操作。这是当前最大的一块缺口。
- **Cashier-web**（收银台）：订单流转 + 收银，需按触屏场景单独设计。
- **Admin-web 的订单 / 支付只读视图**：后端 M3/M4 已完成（`order:*`、`payment:*` 权限点与
  8xxxx / 9xxxx 错误码段），可在「商户详情」里再加两个只读标签页。
- **token 与端的绑定**：目前端归属只在登录时校验；如需更强隔离，可把 `portal` 写进 JWT
  并要求请求头一致，防止 token 跨端复用（当前权限点已能拦住越权接口，属加固项）。
