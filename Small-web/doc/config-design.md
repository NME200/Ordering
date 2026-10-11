# 多商户点餐系统 · 配置化设计方案

把首页、个人中心、会员卡、优惠券中心四个运营位做成「后台可配置、前端实时生效」，参照三勾点餐系统的「页面装修 / 主题设置 / 一键配置」思路。

---

## 一、架构总览

```
┌──────────────┐   配置写入    ┌──────────────┐   下发 JSON   ┌──────────────┐
│  管理端装修后台 │ ──────────→ │  配置服务/DB   │ ──────────→  │  小程序渲染引擎 │
│  （生产配置）  │             │  page_config  │  （消费配置） │  （预置组件库）  │
└──────────────┘             └──────────────┘              └──────────────┘
      拖拽/表单                 按 shop_id 隔离                 按 type 分发渲染
```

**核心链路**：后台编辑 → 保存生成页面配置 JSON → 小程序启动请求接口 → 渲染引擎按 `type` 匹配本地组件 → 注入 `data` 与 `style` 渲染。

---

## 二、数据模型

### 2.1 表结构

```sql
-- 页面配置表
CREATE TABLE page_config (
  id            BIGINT PRIMARY KEY,
  shop_id       BIGINT NOT NULL COMMENT '商户ID，0=平台默认',
  page_key      VARCHAR(32) NOT NULL COMMENT 'home/member/card/coupon',
  version       INT NOT NULL DEFAULT 1,
  status        TINYINT NOT NULL DEFAULT 0 COMMENT '0草稿 1已发布',
  config_json   JSON NOT NULL,
  updated_at    DATETIME,
  UNIQUE KEY uk_shop_page (shop_id, page_key, status)
);

-- 主题配置表（可独立，也嵌入 page_config）
CREATE TABLE theme_config (
  shop_id       BIGINT PRIMARY KEY,
  primary_color VARCHAR(9)  DEFAULT '#C8752B',
  sub_color     VARCHAR(9)  DEFAULT '#8B5E3C',
  bg_color      VARCHAR(9)  DEFAULT '#FAF8F6',
  radius        INT         DEFAULT 16,
  card_alpha    DECIMAL(3,2) DEFAULT 0.70,
  card_gap      INT         DEFAULT 8,
  updated_at    DATETIME
);
```

### 2.2 接口约定

```
GET /api/v1/page/config?pageKey=home&shopId=1001&version=0
→ {
    code: 0,
    data: {
      version: 12,
      etag: "a3f9c2",
      theme:   { ... },
      components: [ ... ]
    }
  }
```

- 用 `etag` / `version` 做增量更新，未变更返回 `304`
- 小程序本地缓存配置，启动先读缓存渲染，再静默拉取更新
- 请求失败或 JSON 校验失败 → 回退内置默认配置，**绝不白屏**

---

## 三、主题配置（第一层，最易落地）

四个页面共享同一套主题，抽成 CSS 变量，后端只下发色值。

```json
{
  "primaryColor": "#C8752B",
  "subColor":     "#8B5E3C",
  "bgColor":      "#FAF8F6",
  "textColor":    "#3A322C",
  "subTextColor": "#9A908A",
  "dividerColor": "#EFEBE7",
  "radius":       16,
  "cardAlpha":    0.70,
  "cardGap":      8,
  "sectionGap":   12,
  "pageMargin":   16
}
```

**前端实现**：

```css
page {
  --primary: #C8752B;
  --radius: 16rpx;
  --card-bg: rgba(255,255,255,0.70);
  --card-gap: 8rpx;
}
```

启动时 `setData` 写入根节点 style，切换主题零性能损耗。**工作量：1–2 人日。**

---

## 四、首页配置（可配置程度最高）

### 4.1 Schema

```json
{
  "pageKey": "home",
  "version": 12,
  "theme": { "…": "见第三节" },
  "components": [
    {
      "id": "c1",
      "type": "banner",
      "visible": true,
      "data": {
        "images": [
          { "url": "https://cdn/banner1.png", "link": "/pages/shop/list" }
        ],
        "indicatorColor": "#C8752B",
        "interval": 2800
      },
      "style": { "height": 360, "radius": 0 }
    },
    {
      "id": "c2",
      "type": "entry-grid",
      "visible": true,
      "data": {
        "cols": 2,
        "items": [
          { "icon": "https://cdn/ic_takeout.png", "text": "门店自取", "link": "/pages/shop/list?mode=pickup", "badge": "" },
          { "icon": "https://cdn/ic_delivery.png", "text": "外卖",     "link": "/pages/shop/list?mode=delivery", "badge": "" },
          { "icon": "https://cdn/ic_dinein.png",  "text": "堂食点餐",  "link": "/pages/dinein/index", "badge": "" },
          { "icon": "https://cdn/ic_queue.png",   "text": "排队叫号",  "link": "/pages/queue/index", "badge": "" },
          { "icon": "https://cdn/ic_store.png",  "text": "查看门店",  "link": "/pages/shop/list", "badge": "" }
        ]
      },
      "style": { "iconSize": 48, "textSize": 13 }
    }
  ]
}
```

### 4.2 可配置项清单

| 组件 | 可配内容 | 备注 |
|---|---|---|
| `banner` | 图片、跳转链接、指示点颜色、切换间隔 | 建议 750×360 |
| `entry-grid` | 列数、图标、名称、跳转链接、角标、排序 | 首页五个入口 |
| `search-bar` | 占位文案、是否显示 | 首页默认不显示 |
| `notice` | 公告内容、滚动方式 | — |
| `shop-list` | 排序方式、显示条数、是否显示距离 | 首页默认不启用 |
| `coupon-entry` | 是否显示、利益点文案 | — |

### 4.3 组件注册表（前端预置，不可动态新增）

```js
const ComponentRegistry = {
  'banner':      '/components/diy/banner/index',
  'entry-grid':  '/components/diy/entry-grid/index',
  'search-bar':  '/components/diy/search-bar/index',
  'notice':      '/components/diy/notice/index',
  'shop-list':   '/components/diy/shop-list/index',
  'coupon-entry':'/components/diy/coupon-entry/index'
};
```

渲染时 `wx:if` 按 `type` 分发；`type` 不在注册表内则跳过该组件并上报告警。

---

## 五、个人中心配置

```json
{
  "pageKey": "member",
  "version": 8,
  "components": [
    {
      "id": "m1",
      "type": "user-header",
      "data": {
        "bgType": "gradient",
        "bgColors": ["#C8752B", "#E8A860"],
        "showId": true,
        "bindPhoneTip": "点击绑定手机号，确保账户安全"
      }
    },
    {
      "id": "m2",
      "type": "asset-bar",
      "data": {
        "items": [
          { "key": "balance", "label": "金额(元)", "api": "/api/user/balance" },
          { "key": "point",   "label": "积分",     "api": "/api/user/point" },
          { "key": "coupon",  "label": "优惠券",    "api": "/api/user/coupon-count" }
        ]
      }
    },
    {
      "id": "m3",
      "type": "order-entry",
      "data": {
        "items": [
          { "text": "待付款",   "icon": "ic_unpaid",  "link": "/pages/order/list?tab=1", "badgeApi": "/api/order/count?status=1" },
          { "text": "待使用",   "icon": "ic_unused",  "link": "/pages/order/list?tab=2" },
          { "text": "待评价",   "icon": "ic_review",  "link": "/pages/order/list?tab=3" },
          { "text": "退款售后", "icon": "ic_refund",  "link": "/pages/aftersale/list" }
        ]
      }
    },
    {
      "id": "m4",
      "type": "service-grid",
      "data": {
        "title": "服务功能",
        "cols": 3,
        "items": [
          { "icon": "ic_gift",    "text": "新客有礼",   "link": "/pages/activity/newcomer", "visible": true },
          { "icon": "ic_address", "text": "收货地址",   "link": "/pages/address/list",      "visible": true },
          { "icon": "ic_coupon",  "text": "领券中心",   "link": "/pages/coupon/center",     "visible": true },
          { "icon": "ic_mycoupon","text": "我的优惠券", "link": "/pages/coupon/mine",       "visible": true },
          { "icon": "ic_card",    "text": "会员卡",     "link": "/pages/member/card",       "visible": true },
          { "icon": "ic_invoice", "text": "发票管理",   "link": "/pages/invoice/list",      "visible": true },
          { "icon": "ic_service", "text": "在线客服",   "link": "/pages/service/chat",      "visible": true },
          { "icon": "ic_birth",   "text": "生日有礼",   "link": "/pages/activity/birthday", "visible": true },
          { "icon": "ic_setting", "text": "设置",       "link": "/pages/setting/index",     "visible": true }
        ]
      }
    }
  ]
}
```

**可配内容**：头部背景（渐变色值/图片）、是否显示 ID、绑定提示文案、资产项（显示哪些、顺序、文案）、订单入口四项（图标/文案/跳转/角标接口）、服务九宫格（增删改、拖拽排序、显隐开关、跳转链接）。

---

## 六、会员卡配置

```json
{
  "pageKey": "card",
  "version": 5,
  "components": [
    {
      "id": "v1",
      "type": "member-card",
      "data": {
        "brandName": "旺卡咖啡",
        "bgType": "gradient",
        "bgColors": ["#3A2A1E", "#8B5E3C"],
        "showCardNo": true,
        "showGrowth": true,
        "growthApi": "/api/member/growth",
        "levelName": "黄金会员"
      }
    },
    {
      "id": "v2",
      "type": "benefit-grid",
      "data": {
        "title": "会员权益",
        "cols": 4,
        "items": [
          { "icon": "ic_birth",   "text": "生日礼券" },
          { "icon": "ic_free",    "text": "免配送费" },
          { "icon": "ic_double",  "text": "积分加倍" },
          { "icon": "ic_service", "text": "专属客服" }
        ]
      }
    },
    {
      "id": "v3",
      "type": "task-list",
      "data": {
        "title": "成长任务",
        "api": "/api/member/tasks",
        "items": [
          { "text": "累计消费满200元", "progressApi": "/api/member/task/1", "btnText": "去完成", "link": "/pages/shop/list" },
          { "text": "邀请1位好友注册",  "progressApi": "/api/member/task/2", "btnText": "去完成", "link": "/pages/invite/index" }
        ]
      }
    },
    {
      "id": "v4",
      "type": "footer-button",
      "data": {
        "text": "立即开通会员",
        "link": "/pages/member/open",
        "openedText": "查看我的权益"
      }
    }
  ]
}
```

**可配内容**：卡面品牌名与渐变色、等级名称、是否显示卡号与成长值、权益四宫格（增删改排序）、任务列表（文案/进度接口/跳转）、底部按钮文案与状态切换。

---

## 七、优惠券中心配置

```json
{
  "pageKey": "coupon",
  "version": 6,
  "components": [
    {
      "id": "k1",
      "type": "tab-bar",
      "data": {
        "items": [
          { "text": "未使用", "value": "unused",  "api": "/api/coupon/list?status=unused" },
          { "text": "已使用", "value": "used",    "api": "/api/coupon/list?status=used" },
          { "text": "已过期", "value": "expired", "api": "/api/coupon/list?status=expired" }
        ],
        "defaultIndex": 0
      }
    },
    {
      "id": "k2",
      "type": "coupon-list",
      "data": {
        "cardStyle": "ticket",
        "showShopName": true,
        "showExpire": true,
        "btnText": "立即使用",
        "expiredBtnText": "已过期",
        "emptyText": "暂无优惠券"
      }
    },
    {
      "id": "k3",
      "type": "rule-entry",
      "data": { "text": "使用规则", "link": "/pages/coupon/rule", "visible": true }
    }
  ]
}
```

**可配内容**：tab 名称与顺序、券面样式（票根/简约）、是否显示门店名与有效期、按钮文案（三种状态）、空状态文案、规则入口显隐。

> 券的**数据**（面额、门槛、有效期）走商品/营销接口，只有**展示形态**走装修配置。

---

## 八、渲染引擎（小程序端）

```js
// pages/diy/index.js
Page({
  data: { theme: {}, components: [], loaded: false },

  onLoad() {
    const cached = wx.getStorageSync('page_config_' + this.options.pageKey)
    if (cached) this.render(cached)          // 先渲染缓存，避免白屏
    this.fetchConfig()
  },

  async fetchConfig() {
    try {
      const res = await request('/api/v1/page/config', {
        pageKey: this.options.pageKey,
        shopId: getApp().globalData.shopId,
        version: this.data.version || 0
      })
      if (res.code === 304) return           // 无变更
      if (!this.validate(res.data)) throw new Error('invalid schema')
      wx.setStorageSync('page_config_' + this.options.pageKey, res.data)
      this.render(res.data)
    } catch (e) {
      // 降级：用内置默认配置，绝不白屏
      if (!this.data.loaded) this.render(getDefaultConfig(this.options.pageKey))
      report('page_config_error', e)
    }
  },

  validate(data) {
    return data && Array.isArray(data.components) &&
           data.components.every(c => c.type && c.data)
  },

  render(data) {
    this.setData({
      theme: data.theme || getDefaultTheme(),
      components: data.components || [],
      loaded: true
    })
  }
})
```

```xml
<!-- pages/diy/index.wxml -->
<view class="page" style="--primary:{{theme.primaryColor}};--radius:{{theme.radius}}rpx;--card-bg:rgba(255,255,255,{{theme.cardAlpha}});--card-gap:{{theme.cardGap}}rpx;">
  <block wx:for="{{components}}" wx:key="id">
    <block wx:if="{{item.visible !== false}}">
      <diy-banner      wx:if="{{item.type==='banner'}}"      config="{{item}}" />
      <diy-entry-grid  wx:if="{{item.type==='entry-grid'}}"  config="{{item}}" />
      <diy-service-grid wx:if="{{item.type==='service-grid'}}" config="{{item}}" />
      <diy-member-card wx:if="{{item.type==='member-card'}}"  config="{{item}}" />
      <diy-coupon-list wx:if="{{item.type==='coupon-list'}}"  config="{{item}}" />
      <!-- 新增组件在此扩展 -->
    </block>
  </block>
</view>
```

---

## 九、硬性约束与避坑

| 约束 | 说明 | 应对 |
|---|---|---|
| 不能动态下载代码 | 组件必须打包进小程序包 | 组件库预置，配置只决定"用哪个" |
| tabBar 必须静态声明 | `pages.json` 无法动态改 | 预置壳页面 + 隐藏原生 tabBar + 自定义组件读接口渲染 |
| 配置可能出错 | JSON 不合法会导致白屏 | 本地内置默认配置 + schema 校验 + 组件注册校验 |
| 多商户视觉冲突 | 各商户配置互相污染 | 按 `shop_id` 隔离，平台层留兜底主题 |
| 首屏加载变慢 | 多一次配置请求 | 本地缓存优先 + etag 增量 + CDN 边缘节点 |
| 包体积膨胀 | 组件越加越多 | 组件走分包，配置化页面单独分包 |

---

## 十、落地路径

| 阶段 | 内容 | 工作量 |
|---|---|---|
| P0 主题换肤 | 色值/圆角/透明度/间距配置化 + 后台主题设置页 | 1–2 人日 |
| P1 内容配置 | 首页五个入口、个人中心九宫格、会员权益、券样式 | 3–5 人日 |
| P2 发布与灰度 | 草稿/预览/发布、版本回溯、按商户灰度 | 3–5 人日 |
| P3 可视化拖拽 | 组件库 + 拖拽画布 + 实时预览 + 撤销重做 | 6–8 周 |

**建议先做 P0 + P1**，一周内可见效果，验证运营确实在用后再投入 P3。交易链路页面（确认订单、购物车、规格弹层、订单详情）保持硬编码，稳定优先。

---

## 十一、后台界面设计稿

### 11.1 装修工作台（页面管理 + 主题设置）

> 配图「装修工作台」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。

### 11.2 首页可视化编辑器（组件库 + 预览 + 属性面板）

> 配图「首页编辑器」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。

### 11.3 服务功能配置（个人中心 / 会员卡 / 优惠券中心共用）

> 配图「服务功能配置」：原为对象存储的带签名临时外链（会过期），不入库；本地参考图见仓库根目录 `UI设计图片/`。
