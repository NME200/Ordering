/**
 * 小程序布局与活动弹窗 —— 与后端 `modules/app-config`、`modules/popup` 的出入参对齐。
 *
 * 只有平台端用得到，所以放在 Admin-web 而不是 Web-shared
 * （与 `types/payment-config.ts` 同样的归属判断）。
 * ⚠️ 字段名与枚举必须跟 `ordering-serve/src/modules/app-config/constants/app-config-schema.ts`
 * 同步：后端是白名单的唯一事实来源，这里写错只会让保存时报「不支持的组件类型」。
 */

export type AppConfigStatus = 'draft' | 'published' | 'archived';

export const APP_CONFIG_STATUS_LABELS: Record<AppConfigStatus, string> = {
  draft: '草稿',
  published: '生效中',
  archived: '历史版本',
};

/** 可装修的四个页面 */
export type AppConfigPageKey = 'home' | 'member' | 'card' | 'coupon';

export const APP_CONFIG_PAGES: AppConfigPageKey[] = ['home', 'member', 'card', 'coupon'];

export const PAGE_META: Record<AppConfigPageKey, { label: string; hint: string }> = {
  home: { label: '首页', hint: '品牌图与场景入口，顾客进来第一屏' },
  member: { label: '个人中心', hint: '头部、资产、订单入口与服务宫格' },
  card: { label: '会员卡', hint: '卡面、权益、成长任务与底部按钮' },
  coupon: { label: '优惠券中心', hint: '券页签、券列表与规则入口' },
};

/** 组件类型白名单，必须与后端 `AppConfigSectionKey` 一致 */
export type SectionKey =
  | 'banner'
  | 'entryGrid'
  | 'searchBar'
  | 'notice'
  | 'shopList'
  | 'couponEntry'
  | 'userHeader'
  | 'assetBar'
  | 'orderEntry'
  | 'serviceGrid'
  | 'memberCard'
  | 'benefitGrid'
  | 'taskList'
  | 'footerButton'
  | 'couponTabs'
  | 'couponList'
  | 'ruleEntry';

/** 每个页面允许的组件；后端按同一张表拒收越界组件 */
export const PAGE_SECTION_KEYS: Record<AppConfigPageKey, SectionKey[]> = {
  home: ['banner', 'entryGrid', 'searchBar', 'notice', 'shopList', 'couponEntry'],
  member: ['userHeader', 'assetBar', 'orderEntry', 'serviceGrid'],
  card: ['memberCard', 'benefitGrid', 'taskList', 'footerButton'],
  coupon: ['couponTabs', 'couponList', 'ruleEntry'],
};

/**
 * 新建草稿的默认主题 —— 与后端 DEFAULT_APP_CONFIG_CONTENT.theme 同一份值，
 * 否则运营新建一份要先把六个色值全点一遍。
 */
export const DEFAULT_THEME: AppTheme = {
  primaryColor: '#c8752b',
  subColor: '#8b5e3c',
  bgColor: '#faf8f6',
  textColor: '#3a322c',
  subTextColor: '#9a908a',
  dividerColor: '#efebe7',
  radius: 16,
  cardAlpha: 0.7,
  cardGap: 8,
  sectionGap: 12,
  pageMargin: 16,
  tabbarSkin: 'warm',
};

/** 内置线稿图标 key，与后端 `APP_ICON_KEYS` 与小程序 `utils/icons.ts` 同一份清单 */
export const APP_ICON_KEYS = [
  'takeout',
  'delivery',
  'dinein',
  'queue',
  'store',
  'search',
  'notice',
  'hot',
  'coupon',
  'balance',
  'points',
  'memberCard',
  'invoice',
  'service',
  'setting',
  'gift',
  'birthday',
  'address',
  'unpaid',
  'pending',
  'review',
  'refund',
  'freeShipping',
  'doublePoints',
  'phone',
  'clock',
] as const;

export type AppIconKey = (typeof APP_ICON_KEYS)[number];

/** 图标选择器用的中文名 */
export const ICON_LABELS: Record<AppIconKey, string> = {
  takeout: '门店自取',
  delivery: '外卖',
  dinein: '堂食',
  queue: '排队',
  store: '门店',
  search: '搜索',
  notice: '公告',
  hot: '热销',
  coupon: '优惠券',
  balance: '余额',
  points: '积分',
  memberCard: '会员卡',
  invoice: '发票',
  service: '客服',
  setting: '设置',
  gift: '礼盒',
  birthday: '生日',
  address: '地址',
  unpaid: '待付款',
  pending: '进行中',
  review: '评价',
  refund: '退款',
  freeShipping: '免配送费',
  doublePoints: '积分加倍',
  phone: '电话',
  clock: '时间',
};

/** 可跳转的页面路径，与后端 `APP_PAGE_PATHS` 一致；`scan` 是唤起扫码的保留动作 */
export const APP_LINKS: { value: string; label: string }[] = [
  { value: '', label: '不跳转' },
  { value: '/pages/home/home', label: '首页' },
  { value: '/pages/stores/stores', label: '查看门店' },
  { value: '/pages/menu/menu', label: '点餐页' },
  { value: '/pages/orders/orders', label: '订单列表' },
  { value: '/pages/profile/profile', label: '个人中心' },
  { value: '/pages/address/address', label: '收货地址' },
  { value: '/pages/coupon/coupon', label: '优惠券中心' },
  { value: '/pages/card/card', label: '会员卡' },
  { value: '/pages/invoice/invoice', label: '发票管理' },
  { value: '/pages/service/service', label: '在线客服' },
  { value: '/pages/review/review', label: '订单评价' },
  { value: '/pages/queue/queue', label: '排队叫号' },
  { value: '/pages/settings/settings', label: '设置' },
  { value: 'scan', label: '唤起扫码' },
];

/** 闭合的枚举清单：这些键与后端同名常量一一对应 */
export const ASSET_KEYS = ['balance', 'point', 'coupon'] as const;
export const ORDER_ENTRY_KEYS = ['unpaid', 'processing', 'review', 'refund'] as const;
export const SERVICE_ENTRY_KEYS = [
  'newcomer',
  'address',
  'couponCenter',
  'couponMine',
  'memberCard',
  'invoice',
  'service',
  'birthday',
  'setting',
  'queue',
  'stores',
] as const;
export const BENEFIT_KEYS = ['birthday', 'freeShipping', 'doublePoints', 'service', 'coupon', 'points'] as const;
export const COUPON_TAB_KEYS = ['unused', 'used', 'expired'] as const;

export const ENUM_LABELS: Record<string, string> = {
  balance: '余额',
  point: '积分',
  coupon: '优惠券',
  unpaid: '待付款',
  processing: '进行中',
  review: '待评价',
  refund: '退款/售后',
  newcomer: '新客有礼',
  address: '收货地址',
  couponCenter: '领券中心',
  couponMine: '我的优惠券',
  memberCard: '会员卡',
  invoice: '发票管理',
  service: '在线客服',
  birthday: '生日有礼',
  setting: '设置',
  queue: '排队叫号',
  stores: '查看门店',
  freeShipping: '免配送费',
  doublePoints: '积分加倍',
  unused: '未使用',
  used: '已使用',
  expired: '已过期',
};

/** 主题 token：四页共享，字段名与后端 `AppThemeDto` 一致 */
export interface AppTheme {
  primaryColor?: string;
  subColor?: string;
  bgColor?: string;
  textColor?: string;
  subTextColor?: string;
  dividerColor?: string;
  /** 卡片圆角（px） */
  radius?: number;
  /** 卡片不透明度 */
  cardAlpha?: number;
  cardGap?: number;
  sectionGap?: number;
  pageMargin?: number;
  /** tabBar 皮肤标识：图标是小程序包内静态资源，这里只能下发「用哪一套」 */
  tabbarSkin?: string;
}

export interface BannerImage {
  url: string;
  link?: string;
}

export interface IconItem {
  /** 只有带图标的组件才需要；资产栏 / 券页签 / 任务列表没有图标 */
  icon?: AppIconKey;
  /** 资产栏用 label 命名，其余宫格用 text；后端按组件类型各自要求 */
  text?: string;
  link?: string;
  badge?: string;
  /** 各宫格自己的可选字段，后端按组件类型校验 */
  key?: string;
  label?: string;
  desc?: string;
  btnText?: string;
  enabled?: boolean;
}

/**
 * 各组件 props 的并集（字段都可空 —— 具体哪个组件需要哪些字段由后端按 key 校验）。
 *
 * 刻意用「一个可空字段并集」而不是 `Record<string, unknown>`：
 * 属性面板要能直接 `v-model` 绑到具体字段上。
 */
export interface SectionProps {
  images?: BannerImage[];
  height?: number;
  radius?: number;
  indicatorColor?: string;
  interval?: number;
  cols?: number;
  items?: IconItem[];
  title?: string;
  placeholder?: string;
  link?: string;
  text?: string;
  bgColor?: string;
  textColor?: string;
  icon?: AppIconKey;
  sortMode?: 'distance' | 'sales';
  limit?: number;
  showDistance?: boolean;
  benefit?: string;
  bgType?: 'gradient' | 'image';
  bgColors?: string[];
  bgImage?: string;
  showId?: boolean;
  bindPhoneTip?: string;
  brandName?: string;
  levelName?: string;
  showCardNo?: boolean;
  showGrowth?: boolean;
  openedText?: string;
  defaultIndex?: number;
  cardStyle?: 'ticket' | 'plain';
  showShopName?: boolean;
  showExpire?: boolean;
  btnText?: string;
  expiredBtnText?: string;
  emptyText?: string;
}

export interface LayoutSection {
  id: string;
  key: SectionKey;
  visible: boolean;
  props: SectionProps;
}

export type AppConfigPages = Record<AppConfigPageKey, LayoutSection[]>;

export interface AppConfigContent {
  theme: AppTheme;
  pages: AppConfigPages;
}

export interface AppConfig {
  id: number;
  name: string;
  status: AppConfigStatus;
  statusLabel: string;
  version: number;
  content: AppConfigContent;
  createdBy: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 保存入参：后端 DTO 是扁平的 `{ name, theme, pages }`，不是嵌 content */
export interface SaveAppConfigPayload {
  name: string;
  theme: AppTheme;
  pages: AppConfigPages;
}

/** 预览用的菜品摘要（来自所选预览门店的真实菜单） */
export interface PreviewDish {
  id: number;
  name: string;
  price: number;
  imageUrl: string | null;
}

/** 装修画布的预览数据源 */
export interface PreviewData {
  categories: string[];
  dishes: PreviewDish[];
  /** 预览门店名：门店列表与会员卡面要用，没选门店时留空 */
  storeName: string;
}

/** 各组件的默认属性：拖进画布时用它初始化，避免属性面板对着 undefined 渲染 */
export const SECTION_DEFAULTS: Record<SectionKey, () => SectionProps> = {
  banner: () => ({ images: [], height: 200, radius: 0, interval: 3000 }),
  entryGrid: () => ({ cols: 2, title: '', items: [] }),
  searchBar: () => ({ placeholder: '搜索门店', link: '/pages/stores/stores' }),
  notice: () => ({ text: '', icon: 'notice' }),
  shopList: () => ({ sortMode: 'distance', limit: 10, showDistance: true, title: '附近门店' }),
  couponEntry: () => ({ title: '领券中心', benefit: '新人立减 5 元', icon: 'coupon', link: '/pages/coupon/coupon' }),
  userHeader: () => ({ bgType: 'gradient', bgColors: ['#C8752B', '#E8A860'], showId: true, bindPhoneTip: '点击绑定手机号' }),
  assetBar: () => ({
    items: [
      { key: 'balance', label: '余额' },
      { key: 'point', label: '积分' },
      { key: 'coupon', label: '优惠券' },
    ],
  }),
  orderEntry: () => ({
    title: '我的订单',
    items: [
      { key: 'unpaid', text: '待付款', icon: 'unpaid', link: '/pages/orders/orders' },
      { key: 'processing', text: '进行中', icon: 'pending', link: '/pages/orders/orders' },
      { key: 'review', text: '待评价', icon: 'review', link: '/pages/orders/orders' },
      { key: 'refund', text: '退款', icon: 'refund', link: '/pages/orders/orders' },
    ],
  }),
  serviceGrid: () => ({
    title: '服务功能',
    cols: 3,
    items: [
      { key: 'address', text: '收货地址', icon: 'address', link: '/pages/address/address' },
      { key: 'couponCenter', text: '领券中心', icon: 'coupon', link: '/pages/coupon/coupon' },
      { key: 'couponMine', text: '我的优惠券', icon: 'coupon', link: '/pages/coupon/coupon' },
      { key: 'memberCard', text: '会员卡', icon: 'memberCard', link: '/pages/card/card' },
      { key: 'invoice', text: '发票管理', icon: 'invoice', link: '/pages/invoice/invoice' },
      { key: 'service', text: '在线客服', icon: 'service', link: '/pages/service/service' },
      { key: 'queue', text: '排队叫号', icon: 'queue', link: '/pages/queue/queue' },
      { key: 'stores', text: '查看门店', icon: 'store', link: '/pages/stores/stores' },
      { key: 'setting', text: '设置', icon: 'setting', link: '/pages/profile/profile' },
    ],
  }),
  memberCard: () => ({
    bgType: 'gradient',
    bgColors: ['#3A2A1E', '#8B5E3C'],
    brandName: '旺卡咖啡',
    levelName: '黄金会员',
    showCardNo: true,
    showGrowth: true,
  }),
  benefitGrid: () => ({
    title: '会员权益',
    cols: 4,
    items: [
      { key: 'birthday', text: '生日礼券', icon: 'birthday' },
      { key: 'freeShipping', text: '免配送费', icon: 'freeShipping' },
      { key: 'doublePoints', text: '积分加倍', icon: 'doublePoints' },
      { key: 'service', text: '专属客服', icon: 'service' },
    ],
  }),
  taskList: () => ({ title: '成长任务', items: [{ text: '累计消费满 200 元', btnText: '去完成', link: '/pages/stores/stores' }] }),
  footerButton: () => ({ text: '立即开通会员', openedText: '查看我的权益', link: '/pages/card/card' }),
  couponTabs: () => ({
    items: [
      { key: 'unused', text: '未使用' },
      { key: 'used', text: '已使用' },
      { key: 'expired', text: '已过期' },
    ],
    defaultIndex: 0,
  }),
  couponList: () => ({
    cardStyle: 'ticket',
    showShopName: true,
    showExpire: true,
    btnText: '立即使用',
    expiredBtnText: '已过期',
    emptyText: '暂无优惠券',
  }),
  ruleEntry: () => ({ text: '使用规则' }),
};

/** 组件库的展示元信息 */
/** 组件库那行的图标（取后台线稿图标库的 key，与小程序同一份 path） */
export const SECTION_META: Record<SectionKey, { label: string; hint: string; icon: string }> = {
  banner: { label: '品牌轮播', hint: '顶部大图，最多 5 张，可配跳转', icon: 'hot' },
  entryGrid: { label: '场景入口', hint: '门店自取 / 外卖 / 堂食 / 排队 / 查看门店', icon: 'dinein' },
  searchBar: { label: '搜索框', hint: '首页默认不放，需要时再开', icon: 'search' },
  notice: { label: '公告栏', hint: '一行文字，最长 60 字', icon: 'notice' },
  shopList: { label: '门店列表', hint: '按距离或月售排，默认不启用', icon: 'store' },
  couponEntry: { label: '领券入口', hint: '一条利益点横幅，只决定说什么', icon: 'coupon' },
  userHeader: { label: '用户头部', hint: '头像 / 昵称 / ID / 绑定提示', icon: 'user' },
  assetBar: { label: '资产栏', hint: '余额 / 积分 / 优惠券，可增删与排序', icon: 'balance' },
  orderEntry: { label: '订单入口', hint: '待付款 / 进行中 / 待评价 / 退款', icon: 'order' },
  serviceGrid: { label: '服务宫格', hint: '九宫格入口，可增删改排序', icon: 'setting' },
  memberCard: { label: '会员卡面', hint: '品牌名 / 等级 / 卡号 / 成长值', icon: 'memberCard' },
  benefitGrid: { label: '会员权益', hint: '四宫格权益图标', icon: 'gift' },
  taskList: { label: '成长任务', hint: '任务文案与跳转', icon: 'clock' },
  footerButton: { label: '底部按钮', hint: '未开通与已开通两套文案', icon: 'check' },
  couponTabs: { label: '券页签', hint: '未使用 / 已使用 / 已过期', icon: 'coupon' },
  couponList: { label: '券列表', hint: '票根或简约两种券面', icon: 'coupon' },
  ruleEntry: { label: '规则入口', hint: '右上角「使用规则」小字', icon: 'notice' },
};

/**
 * 「添加一项」的起手行，按组件分派。
 *
 * 字段必须落在后端该组件项 DTO 的白名单里 —— 多写一个键（比如给入口宫格塞 `btnText`）
 * 会被 `forbidNonWhitelisted` 整条拒掉，表现为「点了添加就存不下去」。
 */
export const SECTION_ITEM_DEFAULTS: Record<string, () => IconItem> = {
  entryGrid: () => ({ icon: 'store', text: '', link: '' }),
  taskList: () => ({ text: '', btnText: '去完成', link: '' }),
};

/** 枚举型列表项的默认图标与跳转：按「组件 + 键」取，免得所有项都长成同一个图标 */
export const ENUM_ITEM_DEFAULTS: Record<string, Record<string, Partial<IconItem>>> = {
  orderEntry: {
    unpaid: { icon: 'unpaid', link: '/pages/orders/orders' },
    processing: { icon: 'pending', link: '/pages/orders/orders' },
    review: { icon: 'review', link: '/pages/orders/orders' },
    refund: { icon: 'refund', link: '/pages/orders/orders' },
  },
  serviceGrid: {
    newcomer: { icon: 'gift' },
    address: { icon: 'address', link: '/pages/address/address' },
    couponCenter: { icon: 'coupon', link: '/pages/coupon/coupon' },
    couponMine: { icon: 'coupon', link: '/pages/coupon/coupon' },
    memberCard: { icon: 'memberCard', link: '/pages/card/card' },
    invoice: { icon: 'invoice', link: '/pages/invoice/invoice' },
    service: { icon: 'service', link: '/pages/service/service' },
    birthday: { icon: 'birthday' },
    setting: { icon: 'setting', link: '/pages/profile/profile' },
    queue: { icon: 'queue', link: '/pages/queue/queue' },
    stores: { icon: 'store', link: '/pages/stores/stores' },
  },
  // 权益项的 DTO 只有 key / text / icon / desc，**不能带 link**
  benefitGrid: {
    birthday: { icon: 'birthday' },
    freeShipping: { icon: 'freeShipping' },
    doublePoints: { icon: 'doublePoints' },
    service: { icon: 'service' },
    coupon: { icon: 'coupon' },
    points: { icon: 'points' },
  },
  couponTabs: {},
};

/* ==================== 活动弹窗 ==================== */

export type PopupType = 'image' | 'notice';
export type PopupScene = 'app_launch' | 'home' | 'store_enter' | 'pay_success';
export type PopupFrequency = 'once' | 'daily' | 'always';
export type PopupQueueMode = 'queue' | 'top_only';

export const POPUP_TYPE_LABELS: Record<PopupType, string> = {
  image: '图文弹窗',
  notice: '公告弹窗',
};

export const POPUP_SCENE_LABELS: Record<PopupScene, string> = {
  app_launch: '冷启动',
  home: '进首页',
  store_enter: '进店',
  pay_success: '支付成功',
};

export const POPUP_FREQUENCY_LABELS: Record<PopupFrequency, string> = {
  once: '只弹一次',
  daily: '每天一次',
  always: '每次触发都弹',
};

export const POPUP_QUEUE_LABELS: Record<PopupQueueMode, string> = {
  queue: '排队弹（关一个再弹下一个）',
  top_only: '只弹优先级最高的一个',
};

export interface PopupContent {
  image?: string;
  link?: string;
  closeStyle?: 'top-right' | 'bottom-text';
  maskAlpha?: number;
  width?: number;
  height?: number;
  title?: string;
  text?: string;
  btnText?: string;
  titleColor?: string;
  [key: string]: unknown;
}

export interface PopupStats {
  exposurePv: number;
  exposureUv: number;
  clickUv: number;
  clickRate: number | null;
}

export interface Popup {
  id: number;
  name: string;
  type: PopupType;
  typeLabel: string;
  scene: PopupScene;
  sceneLabel: string;
  storeId: number | null;
  priority: number;
  status: number;
  startTime: string | null;
  endTime: string | null;
  frequency: PopupFrequency;
  maxShow: number;
  queueMode: PopupQueueMode;
  content: PopupContent;
  stats: PopupStats;
  createdAt: string;
  updatedAt: string;
}

export interface SavePopupPayload {
  name: string;
  type: PopupType;
  scene: PopupScene;
  storeId?: number | null;
  priority?: number;
  status?: number;
  startTime?: string | null;
  endTime?: string | null;
  frequency?: PopupFrequency;
  maxShow?: number;
  queueMode?: PopupQueueMode;
  content: PopupContent;
}
