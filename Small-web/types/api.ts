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
  name: string;
  address: string | null;
  phone: string | null;
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

/** type：0 单选 / 1 多选 */
export interface SpecGroup {
  id: number;
  name: string;
  type: 0 | 1;
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

/* ---------------- 装修配置（平台统一一套） ---------------- */

export type SectionKey = 'banner' | 'notice' | 'categoryNav' | 'hotDishes';

export interface SectionProps {
  images?: { url: string; link?: string }[];
  height?: number;
  radius?: number;
  text?: string;
  bgColor?: string;
  textColor?: string;
  iconUrl?: string;
  columns?: number;
  showAll?: boolean;
  title?: string;
  source?: 'recommend' | 'manual';
  dishIds?: number[];
  showPrice?: boolean;
}

export interface LayoutSection {
  id: string;
  key: SectionKey;
  visible: boolean;
  props: SectionProps;
}

export interface AppTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textPrimary?: string;
  textSecondary?: string;
  cardRadius?: number;
  headerImage?: string;
  logoUrl?: string;
  /** tabBar 图标是包内静态资源，后端只下发「用哪一套」这个 key */
  tabbarSkin?: string;
}

export interface AppConfigPayload {
  theme: AppTheme;
  sections: LayoutSection[];
}

/** 版本命中时后端只回 unchanged，不回正文 */
export interface AppConfigResponse {
  version: number;
  publishedAt?: string;
  unchanged?: boolean;
  content?: AppConfigPayload;
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
  itemCount: number;
  payableAmount: number;
  paidAmount: number | null;
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
  remark?: string;
}
