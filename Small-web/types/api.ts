/**
 * C 端接口出入参类型 —— 与 ordering-serve 的 `modules/public/dto/*` 与
 * `modules/order/dto/*` 逐字段对齐。
 *
 * 金额一律是**整数分**，展示层再转元；这里不做任何单位换算。
 */

/* ---------------- 门店与菜单 ---------------- */

export type BusinessStatus = 0 | 1;

export interface PublicStore {
  id: number;
  /**
   * 所属商户 ID。积分 / 余额 / 等级 / 券都按商户归属，
   * 「我的」页必须知道当前门店属于哪个品牌才能读到自己的会员档案。
   */
  merchantId: number;
  name: string;
  address: string | null;
  phone: string | null;
  /** 门店 logo；未录入时列表用店名首字兜底 */
  logo: string | null;
  /** 营业时间展示文案，如「09:00-21:00」；只做展示，打烊由 businessStatus 决定 */
  businessHours: string | null;
  /** 经纬度：商户后台手填；null 表示未录入，顾客端就不显示距离 */
  latitude: number | null;
  longitude: number | null;
  businessStatus: BusinessStatus;
  businessStatusLabel: string;
  /** 现在能不能下单：打烊或被停用都为 false */
  orderable: boolean;
  orderableHint: string | null;
}

export interface SpecOption {
  id: number;
  name: string;
  /** 价格增量（分），可为负 */
  priceDiff: number;
}

/** type：1 单选 / 2 多选，与后端 `SpecType` 一致（没有 0） */
export interface SpecGroup {
  id: number;
  name: string;
  type: 1 | 2;
  isRequired: boolean;
  options: SpecOption[];
}

export interface MenuDish {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** 已是本店有效价（门店例外合并后的结果） */
  price: number;
  unit: string;
  sort: number;
  isRecommend: boolean;
  /** 今日售罄：仍要显示，置灰不可点 */
  soldOut: boolean;
  /** 近 30 天本店已完成订单的销量（份） */
  monthlySales: number;
  specGroups: SpecGroup[];
}

export interface MenuCategory {
  id: number;
  name: string;
  sort: number;
  dishes: MenuDish[];
}

export interface PublicMenu {
  store: PublicStore;
  categories: MenuCategory[];
}

/* ---------------- 装修配置（平台统一一套，四个可装修页） ---------------- */

/** 可装修的页面，与后端 `AppConfigPageKey` 一致 */
export type AppConfigPageKey = 'home' | 'member' | 'card' | 'coupon';

/**
 * 组件白名单，与后端 `AppConfigSectionKey` 一一对应。
 *
 * 每加一个 key，后端校验类、平台装修器、这里下面的渲染器要同时动，
 * 且小程序渲染器必须先发版 —— 白名单外的 key 一律跳过，不报错。
 */
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

/** 内置线稿图标 key，与后端 `APP_ICON_KEYS` 同一份清单（见 components/LineIcon.vue） */
export type IconKey =
  | 'takeout'
  | 'delivery'
  | 'dinein'
  | 'queue'
  | 'store'
  | 'search'
  | 'notice'
  | 'hot'
  | 'coupon'
  | 'balance'
  | 'points'
  | 'memberCard'
  | 'invoice'
  | 'service'
  | 'setting'
  | 'gift'
  | 'birthday'
  | 'address'
  | 'unpaid'
  | 'pending'
  | 'review'
  | 'refund'
  | 'freeShipping'
  | 'doublePoints'
  | 'phone'
  | 'clock';

/** 点餐方式的键，与后端 DINING_OPTION_KEYS 一致 */
export type DiningChoice = 'dineIn' | 'pickup' | 'delivery';

/** 宫格 / 入口项的公共形状 */
export interface IconItem {
  icon: IconKey;
  text: string;
  link?: string;
  badge?: string;
}

export interface SectionProps {
  /* banner */
  images?: { url: string; link?: string }[];
  height?: number;
  radius?: number;
  indicatorColor?: string;
  interval?: number;
  /* entryGrid / serviceGrid / orderEntry / assetBar / benefitGrid / taskList */
  cols?: number;
  items?: (IconItem & {
    key?: string;
    label?: string;
    desc?: string;
    btnText?: string;
    enabled?: boolean;
  })[];
  title?: string;
  iconSize?: number;
  /* searchBar */
  placeholder?: string;
  link?: string;
  /* notice */
  text?: string;
  bgColor?: string;
  textColor?: string;
  icon?: IconKey;
  /* shopList */
  sortMode?: 'distance' | 'sales';
  limit?: number;
  showDistance?: boolean;
  /* couponEntry */
  benefit?: string;
  /* userHeader / memberCard */
  bgType?: 'gradient' | 'image';
  bgColors?: string[];
  bgImage?: string;
  showId?: boolean;
  bindPhoneTip?: string;
  brandName?: string;
  levelName?: string;
  showCardNo?: boolean;
  showGrowth?: boolean;
  /* footerButton */
  openedText?: string;
  /* couponTabs / couponList */
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

/** 主题 token，与后端 `AppThemeDto` 逐字段对齐（ui.md 第一节的 Design Tokens） */
export interface AppTheme {
  /** 主色 / 强调色 */
  primaryColor?: string;
  /** 辅助色（暖棕：标题、次级强调） */
  subColor?: string;
  /** 页面背景 */
  bgColor?: string;
  /** 正文 */
  textColor?: string;
  /** 次级文字（月售、时间、说明） */
  subTextColor?: string;
  /** 分割线 */
  dividerColor?: string;
  /** 卡片圆角（px） */
  radius?: number;
  /** 卡片不透明度（毛玻璃半透明白） */
  cardAlpha?: number;
  /** 卡片间距（px） */
  cardGap?: number;
  /** 区块间距（px） */
  sectionGap?: number;
  /** 页边距（px） */
  pageMargin?: number;
  /** tabBar 图标是包内静态资源，后端只下发「用哪一套」这个 key */
  tabbarSkin?: string;
}

export interface AppConfigPayload {
  theme: AppTheme;
  pages: Record<AppConfigPageKey, LayoutSection[]>;
}

/** 版本命中时后端只回 unchanged，不回正文 */
export interface AppConfigResponse {
  version: number;
  publishedAt?: string;
  unchanged?: boolean;
  theme?: AppTheme;
  pages?: Record<AppConfigPageKey, LayoutSection[]>;
}

/* ---------------- 活动弹窗（popup-design.md） ---------------- */

export type PopupType = 'image' | 'notice';
export type PopupScene = 'app_launch' | 'home' | 'store_enter' | 'pay_success';
export type PopupFrequency = 'once' | 'daily' | 'always';

export interface PopupItem {
  popupId: number;
  type: PopupType;
  priority: number;
  frequency: PopupFrequency;
  content: {
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
  };
}

export interface PopupQueue {
  queueMode: 'queue' | 'top_only';
  maxShow: number;
  popups: PopupItem[];
}

/* ---------------- 门店列表 ---------------- */

export interface PublicStoreListItem extends PublicStore {
  /** 近 30 天完成订单份数，与菜品的 monthlySales 同口径 */
  monthlySales: number;
}


/* ---------------- 订单与支付 ---------------- */

/**
 * 订单状态：取值按流程顺序递增（10 待支付 → 60 已取消），
 * 与 `ordering-serve/src/shared/enums/order-status.enum.ts` 一致。
 */
export type OrderStatus = 10 | 20 | 30 | 40 | 50 | 60;

export interface OrderItem {
  dishName: string;
  specSummary: string;
  /** 菜品图（下单时快照）；未录入为 null，界面用首字兜底 */
  dishImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/** 下单响应：payToken 是此后查单 / 支付 / 取消的唯一凭据，必须存下来 */
export interface CreateOrderResult {
  id: number;
  orderNo: string;
  storeId: number;
  status: OrderStatus;
  statusLabel: string;
  payableAmount: number;
  itemCount: number;
  tableNo: string | null;
  /** 取餐码：仅自提单有，柜台前报这个而不是订单号 */
  pickupCode?: string | null;
  diningType?: number;
  diningTypeLabel?: string;
  remark: string | null;
  createdAt: string;
  payToken?: string;
  items?: OrderItem[];
}

export interface PublicOrder {
  orderNo: string;
  storeName: string;
  status: OrderStatus;
  statusLabel: string;
  tableNo: string | null;
  /** 取餐码：仅自提单有，其余为 null */
  pickupCode: string | null;
  /** 就餐方式：0 堂食 / 1 自提 / 2 外卖配送 */
  diningType: number;
  diningTypeLabel: string;
  itemCount: number;
  /** 商品总额（分）。费用明细第一行，收银台与详情页都要显示 */
  totalAmount: number;
  /** 优惠金额（分），未用券为 0 */
  discountAmount: number;
  payableAmount: number;
  paidAmount: number | null;
  /** 支付方式文案；未支付为 null（后端从成功的支付单回填，订单表不存渠道） */
  paidChannelLabel: string | null;
  remark: string | null;
  cancelReason: string | null;
  createdAt: string;
  paidAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  items: OrderItem[];
}

export interface PaymentChannel {
  channel: string;
  label: string;
  /** 只有 online 渠道才能被 C 端用来发起支付 */
  online: boolean;
}

export interface PrepayResult {
  paymentId: number;
  paymentNo: string;
  orderNo: string;
  amount: number;
  channel: string;
  prepayId: string;
  payParams: Record<string, unknown>;
}

/* ---------------- 下单入参 ---------------- */

export interface CreateOrderItemPayload {
  dishId: number;
  quantity: number;
  specOptionIds?: number[];
}

export interface CreateOrderPayload {
  storeId: number;
  items: CreateOrderItemPayload[];
  clientToken?: string;
  customerName?: string;
  customerPhone?: string;
  tableNo?: string;
  /** 0 堂食 / 1 自提 / 2 外卖配送，不传后端按堂食 */
  diningType?: number;
  remark?: string;
  /** 使用的顾客券 ID。抵扣金额由服务端算，前端只传 ID */
  couponId?: number;
  /** 收货地址 ID（外卖配送单） */
  addressId?: number;
}
