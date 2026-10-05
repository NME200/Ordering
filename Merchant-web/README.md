# Merchant-web · Ordering 商户后台

多商户 SaaS 点餐系统的**商户后台**。面向**商户管理员**与**门店管理员**，
负责门店、员工、菜单、订单与收款的日常经营。

> 平台侧的商户治理属于 **Admin-web**，收银台属于 **Cashier-web**。
> 账号能登录哪个端由服务端校验（`portal: merchant`），平台管理员与收银员在此会被拒绝。

## 技术栈

Vue 3 + TypeScript + Vite + Element Plus（按需引入）+ Pinia + Vue Router + Axios。
基础层（请求封装 / 类型 / 设计令牌 / 通用组件 / 业务列表页）来自 **`Web-shared`** 共享源码包。

## 快速开始

```bash
npm install --registry=https://registry.npmmirror.com
npm run dev          # http://localhost:5174
npm run typecheck
npm run build
```

后端需先启动 `ordering-serve`（默认 `http://localhost:3100`）。开发环境通过 Vite 代理 `/api` 直连后端。

### 演示账号（仅开发环境在登录页展示）

| 账号 | 密码 | 角色 | 可登录的端 |
| --- | --- | --- | --- |
| `merchant01` | `Merchant@123456` | 商户管理员 | **本工程** |
| `admin` | `Admin@123456` | 平台管理员 | Admin-web |
| `cashier01` | `Cashier@123456` | 收银员 | Cashier-web |

> 用 `admin` 登录本工程会得到 `403 / 20007`「该账号为「平台管理员」，无法登录商户后台」——
> 这是预期行为。种子数据里暂无门店管理员账号，可在「员工账号」里自行创建。

## 信息架构

| 菜单 | 说明 | 所需权限 |
| --- | --- | --- |
| 工作台 | 订单待办（待支付 / 待接单 / 制作中 / 待取餐）+ 经营规模 | — |
| 订单管理 | 状态计数、列表、详情抽屉、状态流转 | `order:read` |
| 支付流水 | 支付单列表、详情、退款 | `payment:read` |
| 门店管理 | 门店 CRUD | `store:read` |
| 员工账号 | 员工账号 CRUD、重置密码 | `user:read` |
| 菜品分类 | 分类 CRUD | `category:read` |
| 菜品管理 | 菜品 CRUD、上下架、关联规格组 | `dish:read` |
| 规格组 | 规格组与规格项 CRUD | `spec:read` |

菜单按权限点过滤，因此**门店管理员**看不到「员工账号」，且菜品只能上下架、
订单只能接单 / 出餐 / 完成 / 取消、支付只能退款 —— 与后端权限表一一对应。

## 订单状态流转

```
待支付(10) ──线下收款/在线支付──> 待接单(20) ──接单──> 制作中(30) ──出餐──> 待取餐(40) ──完成──> 已完成(50)
     └────────────────────────── 取消 ──────────────────────────┘           已取消(60)
```

- 「线下收款」把待支付订单直接置为已支付（现金 / 收款码场景），权限 `order:update`；
- 「取消 / 拒单」需要 `order:cancel`，可填写原因，会记录到订单上；
- 订单明细里的菜品名、价格、规格都是**下单时的快照**，之后改菜单不影响历史订单。

## 支付与退款

- 每笔订单可能产生多张支付单（取消后重试），列表按支付单维度展示；
- **退款当前仅支持整单全额**，需要 `payment:refund`，会记录退款原因与渠道流水号；
- 已退款 / 退款中的支付单不再显示退款入口。

## 与 Admin-web 的关系

两端的门店 / 员工 / 菜品分类 / 菜品 / 规格组页面是**同一份代码**（`Web-shared/src/views/`）：

| | Merchant-web | Admin-web |
| --- | --- | --- |
| 形态 | 独立路由，完整 CRUD | 商户详情页内的只读标签页 |
| props | 无 | `embedded` + `readonly` + `merchantId` |
| 商户筛选 | 不显示（租户由 Token 决定） | 显示（平台管理员可跨租户） |

新增或修改这些页面时，**改共享包即可，两端同时生效**。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 接口基础路径，默认 `/api/v1` |
| `VITE_PROXY_TARGET` | 仅开发环境：Vite 代理目标 |
| `VITE_APP_TITLE` | 浏览器标题中的应用名 |

## 已知环境问题

**本机 safe-delete 钩子会拦截 Vite 依赖优化器的缓存重建**，导致 dev server 退出。
因此 `vite.config.ts` 用 `optimizeDeps.include` 显式声明了全部预打包依赖。

> ⚠️ 新增 Element Plus 组件时，必须同步在 `OPTIMIZE_DEPS` 中补一行对应的 `style/css` 入口
> （例如 `el-timeline` → `element-plus/es/components/timeline/style/css`），
> 否则首次访问该页面会触发依赖重建并导致 dev server 崩溃。

另外：dev server 若发现 5174 被占用会自动顺延到 5175，排查问题时注意确认实际端口。
