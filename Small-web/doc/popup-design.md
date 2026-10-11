# 活动弹窗配置化设计方案

首页弹窗 + 多弹窗队列 + 后台可配置。弹窗不属于「页面装修」的组件，它是独立的**应用层触发器**，需要单独设计与存储。

---

## 一、为什么弹窗不能塞进页面配置

| 维度 | 页面组件（首页入口等） | 活动弹窗 |
|---|---|---|
| 生命周期 | 随页面渲染存在 | 独立触发、可跨页面 |
| 触发时机 | 页面加载即展示 | 启动 / 进首页 / 支付成功等 |
| 频次控制 | 无 | 每人每天 N 次、仅新客 |
| 生效周期 | 长期 | 活动起止时间 |
| 多实例 | 同页面多个并存 | **同时只能弹一个**，需排队 |
| 数据统计 | 一般埋点 | 曝光/点击/领取漏斗必看 |

所以弹窗要独立一张表、独立一套接口、独立一个前端管理器。

---

## 二、数据模型

```sql
CREATE TABLE popup_config (
  id            BIGINT PRIMARY KEY,
  shop_id       BIGINT NOT NULL DEFAULT 0 COMMENT '商户ID，0=平台通用',
  name          VARCHAR(64)  NOT NULL COMMENT '后台管理用名称',
  type          VARCHAR(20)  NOT NULL COMMENT 'coupon/image/newcomer/signup/notice',
  scene         VARCHAR(32)  NOT NULL COMMENT 'app_launch/home/shop_enter/pay_success',
  priority      INT          NOT NULL DEFAULT 10 COMMENT '数字越小越优先',
  status        TINYINT      NOT NULL DEFAULT 0 COMMENT '0停用 1启用',
  start_time    DATETIME,
  end_time      DATETIME,
  audience      VARCHAR(20)  NOT NULL DEFAULT 'all' COMMENT 'all/new/member/tag',
  frequency     VARCHAR(20)  NOT NULL DEFAULT 'daily' COMMENT 'once/daily/always',
  max_show      INT          NOT NULL DEFAULT 1 COMMENT '单次启动最多弹几个',
  queue_mode    VARCHAR(20)  NOT NULL DEFAULT 'queue' COMMENT 'queue/top_only',
  content_json  JSON NOT NULL COMMENT '弹窗内容与样式',
  created_at    DATETIME,
  updated_at    DATETIME,
  KEY idx_shop_scene (shop_id, scene, status, priority)
);

-- 用户弹窗展示记录（频次控制核心）
CREATE TABLE popup_show_log (
  id         BIGINT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  popup_id   BIGINT NOT NULL,
  show_date  DATE   NOT NULL,
  show_count INT    DEFAULT 1,
  closed     TINYINT DEFAULT 0,
  clicked    TINYINT DEFAULT 0,
  UNIQUE KEY uk_user_popup_date (user_id, popup_id, show_date)
);
```

### content_json 示例（优惠券型）

```json
{
  "image":      "https://cdn/popup/newcomer.png",
  "title":      "新人专享立减5元",
  "subtitle":   "满30元可用 · 领取后7天有效",
  "couponId":   10086,
  "btnText":    "立即领取",
  "link":       "/pages/coupon/detail?id=10086",
  "closeStyle": "top-right",
  "maskAlpha":  0.60,
  "size":       { "width": 600, "height": 780 }
}
```

---

## 三、接口设计

```
GET /api/v1/popup/list?shopId=1001&scene=home
```

```json
{
  "code": 0,
  "data": {
    "queueMode": "queue",
    "maxShow": 3,
    "popups": [
      {
        "popupId": 101,
        "type": "coupon",
        "priority": 1,
        "frequency": "daily",
        "content": { "…": "见上" }
      },
      {
        "popupId": 102,
        "type": "image",
        "priority": 2,
        "frequency": "once",
        "content": { "image": "https://cdn/autumn.png", "link": "/pages/activity/autumn", "closeStyle": "bottom-text" }
      },
      {
        "popupId": 103,
        "type": "newcomer",
        "priority": 3,
        "frequency": "once",
        "content": { "title": "会员开卡礼", "btnText": "去开卡", "link": "/pages/member/open" }
      }
    ]
  }
}
```

**过滤在哪一层做？**

- 时间、状态、人群、商户 → 后端过滤（安全，避免下发不该看的券）
- 频次（今天弹过没）→ **前端本地过滤 + 后端记录双保险**：前端用 `Storage` 判断即时拦截，后端写 `popup_show_log` 做权威校验
- 前端过滤是体验需要（不能每次都等接口），后端校验是防刷与数据准确

---

## 四、多弹窗排队策略

这是多弹窗最核心的设计，三种模式：

| 模式 | 行为 | 适用 |
|---|---|---|
| `queue`（推荐） | 关掉第 1 个后隔 300ms 弹第 2 个，最多 `maxShow` 个 | 常规大促，多活动并存 |
| `top_only` | 只弹优先级最高的那一个 | 重要公告、强制升级 |
| `stack` | 叠加显示 | **不推荐**，体验极差 |

**`queue` 模式的展示逻辑**：

```
拉取到 3 个弹窗
  → 按 priority 升序排序
  → 逐个过滤：本地今日已展示？已领过券？不在活动期？
  → 得到可展示队列 [101, 102]
  → 显示 101，底部角标「1/2」
  → 用户关闭 → 上报 close → 本地记录 → 延迟 300ms 显示 102
  → 用户点击 → 上报 click → 跳转 → **终止队列**（不再弹后面的）
```

**关键规则**：用户点了某个弹窗（产生转化意图）就终止队列，不再骚扰；只是关闭才继续下一个。

---

## 五、触发场景与时机

| scene | 触发点 | 备注 |
|---|---|---|
| `app_launch` | `App.onLaunch` 冷启动 | 最常用，建议延迟 800ms 等首页渲染完 |
| `home` | 首页 `onShow` | 每次回首页都会判断，靠频次拦截 |
| `shop_enter` | 进入门店页 | 可做门店专属活动 |
| `pay_success` | 支付成功页 | 弹「评价有礼」「复购券」 |
| `order_detail` | 订单详情页 | 低频骚扰 |

**避坑**：`home` 场景在 `onShow` 触发时，用户从订单页返回首页也会触发——务必靠 `frequency` + 本地记录拦截，否则用户会觉得被轰炸。

---

## 六、前端 PopupManager

```js
// utils/popup-manager.js
const SHOW_RECORD_KEY = 'popup_show_record'  // { [popupId]: { date, count, closed } }

class PopupManager {
  constructor() {
    this.queue = []
    this.current = null
    this.showing = false
    this.maxShow = 1
  }

  /** 场景触发入口：App.onLaunch / 页面 onShow 调用 */
  async trigger(scene) {
    if (this.showing) return                       // 已有弹窗在展示，不打断
    const res = await request('/api/v1/popup/list', { scene, shopId: getShopId() })
    if (!res.data || !res.data.popups) return

    this.maxShow = res.data.maxShow || 1
    this.queue = res.data.popups
      .sort((a, b) => a.priority - b.priority)
      .filter(p => this.canShow(p))
      .slice(0, this.maxShow)

    this.next()
  }

  /** 是否可展示：频次 + 本地记录 */
  canShow(popup) {
    const record = this.getRecord(popup.popupId)
    const today = formatDate(new Date())

    if (popup.frequency === 'once' && record) return false          // 仅一次
    if (popup.frequency === 'daily' && record?.date === today) return false  // 每天一次
    return true
  }

  next() {
    if (this.queue.length === 0) { this.showing = false; return }
    this.current = this.queue.shift()
    this.showing = true
    this.render(this.current)
    report('popup_show', { popupId: this.current.popupId })  // 曝光埋点
    this.markShown(this.current.popupId)
    request('/api/v1/popup/show-log', { popupId: this.current.popupId })  // 后端记录
  }

  /** 用户点击主按钮：终止队列 */
  onClick() {
    report('popup_click', { popupId: this.current.popupId })
    this.queue = []                                // 终止后续弹窗
    this.close()
    navigateTo(this.current.content.link)
  }

  /** 用户关闭：继续下一个 */
  onClose() {
    report('popup_close', { popupId: this.current.popupId })
    this.markClosed(this.current.popupId)
    this.close()
    setTimeout(() => this.next(), 300)             // 间隔 300ms 再弹下一个
  }

  close() { this.showing = false; this.current = null; this.updateView() }

  getRecord(id)  { return (wx.getStorageSync(SHOW_RECORD_KEY) || {})[id] }
  markShown(id)  { this.writeRecord(id, { shown: true }) }
  markClosed(id) { this.writeRecord(id, { closed: true }) }

  writeRecord(id, patch) {
    const all = wx.getStorageSync(SHOW_RECORD_KEY) || {}
    all[id] = { ...(all[id] || {}), date: formatDate(new Date()), ...patch }
    wx.setStorageSync(SHOW_RECORD_KEY, all)
  }
}

export default new PopupManager()
```

**页面侧挂载**（首页为例）：

```js
// pages/home/index.js  —— 或统一放在 App.onShow
onShow() {
  PopupManager.trigger('home')
}
```

**全局弹窗容器**（放在每个需要弹窗的页面底部，或做成全局组件）：

```xml
<popup-layer wx:if="{{popup.current}}"
  config="{{popup.current.content}}"
  index="{{popup.index}}"
  total="{{popup.total}}"
  bind:click="onPopupClick"
  bind:close="onPopupClose" />
```

---

## 七、弹窗类型与组件映射

| type | 渲染组件 | 核心配置项 |
|---|---|---|
| `coupon` | `popup-coupon` | 主图、标题、副标题、券ID、按钮文案、跳转 |
| `image` | `popup-image` | 图片、跳转链接、点击热区 |
| `newcomer` | `popup-newcomer` | 礼包列表、一键领取按钮 |
| `signup` | `popup-signup` | 活动表单、提交按钮 |
| `notice` | `popup-notice` | 标题、正文、我知道了 |

按 `type` 分发，与页面装修组件共用同一套「注册表 + wx:if 分发」机制，无法动态新增类型。

---

## 八、埋点与数据

后台「数据」列要看的四个指标：

| 指标 | 事件 | 计算 |
|---|---|---|
| 曝光量 | `popup_show` | 去重 UV |
| 点击量 | `popup_click` | 去重 UV |
| 点击率 | — | 点击 / 曝光 |
| 领取转化 | `coupon_receive` | 领券数 / 点击数 |

建议后台弹窗列表直接展示这四个数，方便运营判断哪个弹窗该下线。

---

## 九、避坑清单

| 坑 | 后果 | 应对 |
|---|---|---|
| 弹窗遮挡首页加载 | 白屏上弹窗，观感差 | 延迟 800ms–1s 触发，或等首屏渲染完成 |
| 多弹窗同时叠加 | 用户关不完，直接退出 | 强制队列，禁止 stack |
| 频次失控 | 每次回首页都弹 | 本地记录 + 后端 log 双重校验 |
| 点击后还继续弹 | 骚扰感强 | 点击即终止队列 |
| 券已领完仍弹 | 点击后报错 | 后端下发前校验券库存与领取状态 |
| 弹窗图片过大 | 加载慢、卡顿 | 图片走 CDN，建议 750×900 不超过 200KB，做本地预加载 |
| 小程序层级问题 | 弹窗被原生组件盖住 | 用 `cover-view` 或避免与 `textarea`/`map` 同页 |
| 活动过期未下线 | 展示无效活动 | 后端按 `end_time` 过滤，前端二次校验 |

---

## 十、落地工作量

| 模块 | 内容 | 人日 |
|---|---|---|
| 后端 | popup_config 表 + 列表接口 + 展示记录 + 频次校验 | 2–3 |
| 后台界面 | 弹窗列表 + 新建/编辑表单 + 数据列 | 2–3 |
| 小程序端 | PopupManager + 5 类弹窗组件 + 埋点 | 3–4 |
| 联调与灰度 | 多弹窗队列测试、按商户灰度 | 1–2 |
| **合计** | | **8–12 人日** |

比页面装修轻很多，可以独立排期，不阻塞 P0/P1。

---

## 十一、界面设计稿

### 11.1 弹窗管理列表（优先级 + 数据看板）

> 配图「弹窗管理列表」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。

### 11.2 弹窗编辑配置（投放设置 + 内容 + 预览）

> 配图「弹窗编辑配置」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。

### 11.3 小程序端效果（首页弹窗，支持 1/N 多弹窗角标）

> 配图「首页活动弹窗」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。
