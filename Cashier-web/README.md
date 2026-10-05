# Cashier-web · Ordering 收银台

多商户 SaaS 点餐系统的**收银台**。面向**收银员**与**门店管理员（替班收银）**，
只做一件事：**把这一单点完、收完、做完**。

> 门店 / 员工 / 菜单 / 退款的维护属于 **Merchant-web**，商户治理属于 **Admin-web**。
> 账号能登录哪个端由服务端校验（`portal: cashier`），平台管理员与商户管理员在此会被拒绝。

## 技术栈

Vue 3 + TypeScript + Vite + Element Plus（按需引入）+ Pinia + Vue Router + Axios。
基础层（请求封装 / 类型 / 设计令牌 / 通用组件）来自 **`Web-shared`** 共享源码包。

## 快速开始

```bash
npm install --registry=https://registry.npmmirror.com
npm run dev          # http://localhost:5175
npm run typecheck
npm run build
```

后端需先启动 `ordering-serve`（默认 `http://localhost:3100`）。开发环境通过 Vite 代理 `/api` 直连后端，
**不依赖后端 CORS 白名单**。

### 演示账号（仅开发环境在登录页展示）

| 账号 | 密码 | 角色 | 可登录的端 |
| --- | --- | --- | --- |
| `cashier01` | `Cashier@123456` | 收银员 | **本工程** |
| 门店管理员（种子未创建） | — | `store_manager` | 本工程 + Merchant-web |
| `merchant01` | `Merchant@123456` | 商户管理员 | Merchant-web |
| `admin` | `Admin@123456` | 平台管理员 | Admin-web |

> 用 `merchant01` / `admin` 登录本工程会得到 `403 / 20007`，这是预期行为。
> 想验证门店管理员形态（多出「取消订单」与「退款」两个入口），
> 先在商户后台的「员工账号」里建一个 `store_manager` 并绑定本店。

## 信息架构

收银台是**触屏工位**，不是后台：没有侧边栏，顶部三个通道 + 全屏工作区。

| 通道 | 路径 | 说明 | 所需权限 |
| --- | --- | --- | --- |
| 开单收银 | `/pos` | 左：菜单（分类 / 搜索 / 菜品磁贴）；右：本单票券 | `order:create` |
| 订单流转 | `/orders` | 状态计数、卡片式订单、接单 / 出餐 / 完成 / 收款 | `order:read` |
| 收款记录 | `/payments` | 支付单流水与退款状态 | `payment:read` |
| 我的账号 | `/profile` | 权限点与修改密码（导航中不显示） | — |

**收银员（8 个权限点）看不到取消与退款**：`order:cancel` 与 `payment:refund` 属于资金动作，
只有门店管理员有。前端隐藏只是体验，接口鉴权在服务端。

## 开单与收款

```
点菜（有规格先弹规格窗） → 本单票券 → ┬─ 现金收款 → POST /orders/pos → POST /orders/:id/offline-pay → 待接单
                                      └─ 先开单   → POST /orders/pos（停在待支付，稍后在订单通道收款）
```

- **金额不由前端决定**：请求只带 `dishId / quantity / specOptionIds`，
  单价、规格增量、合计全部由服务端按菜单现价重算并快照落库；
- **门店不由前端决定**：收银员与门店管理员都是门店绑定角色，`storeId` 一律由服务端按 Token 解析；
- **幂等**：一张草稿持有一个 `clientToken`，连点两次「现金收款」只落一单；
  草稿写入 `localStorage`（键 `ordering_cashier_draft`），刷新 / 误触返回不会丢单，
  令牌与草稿同生同灭 —— 开单成功后立即换新，下一单不会被误判为重复提交；
- **收款失败不清草稿**：开单成功但 `offline-pay` 失败时，小票会标成「待收款」并保留草稿，
  重试复用同一张单继续收款，而不是再开一单；
- 打烊门店**仍可开单**（线下由收银员人工判断），这与 C 端扫码下单被拒的行为不同。

## 规格选择

`Dish.specGroups` 里**停用的规格组视为不生效**（与后端 `buildItemDrafts` 同口径），
判定集中在 `src/hooks/usePosMenu.ts` 的 `activeSpecGroups()`：

- 没有任何生效规格 → 点磁贴直接加购；
- 有生效规格 → 弹规格窗；「必选 + 单选」组默认选中第一项（收银台求快，多数顾客要默认档）；
- 必选组未选会被拦下并提示，单选组多选不会发生（交互上互斥）。

## 与后端边界的一致性

| 前端常量 / 行为 | 后端出处 |
| --- | --- |
| `MAX_ORDER_LINES = 50`、`MAX_QUANTITY_PER_LINE = 999` | `order/constants/order-limits.ts` |
| 停用规格组视为不生效 | `order.service.ts` `buildItemDrafts` |
| 菜单只取 `status=1`（已上架） | 下单时下架菜会被 `80004` 拒绝 |
| 错误码 `80004` → 自动刷新菜单 | `ErrorCode.ORDER_DISH_UNAVAILABLE` |

本地拦下超限是为了省一次注定失败的请求，**服务端仍是唯一权威校验方**。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 接口基础路径，默认 `/api/v1` |
| `VITE_PROXY_TARGET` | 仅开发环境：Vite 代理目标 |
| `VITE_APP_TITLE` | 浏览器标题中的应用名 |

令牌存储键为 `ordering_cashier_token`，与另外两端隔离，同一浏览器可三端并登。

## 已知环境问题

**本机 safe-delete 钩子会拦截 Vite 依赖优化器的缓存重建**，导致 dev server 退出。
因此 `vite.config.ts` 用 `optimizeDeps.include` 显式声明了全部预打包依赖。

> ⚠️ 新增 Element Plus 组件时，必须同步在 `OPTIMIZE_DEPS` 中补一行对应的 `style/css` 入口，
> 否则首次访问该页面会触发依赖重建并导致 dev server 崩溃。

其他：

- dev server 端口 5175 被占用时会**静默顺延**到 5176，排查时先 `netstat -ano | grep :517`；
- 菜单一次性最多拉 `5 × 100` 条（后端 `MAX_PAGE_SIZE = 100`）。菜品规模超过 500 时
  需要改成按分类分屏加载，而不是继续放大分页；
- 订单通道每 30 秒自动刷新一次；正在执行操作或开着详情抽屉时那一轮会跳过，
  不会把用户正在看的列表换掉。
