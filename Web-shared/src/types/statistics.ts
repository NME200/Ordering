/**
 * 数据大屏的读模型（与后端 `modules/statistics/dto/screen.dto.ts` 一一对应）。
 *
 * 金额一律是分：大屏上那些「¥1,284」是展示层换算出来的，
 * 任何参与求和、排序、占比计算的数都不该提前变成浮点数。
 */

export interface ScreenOverview {
  revenueCent: number;
  refundCent: number;
  orderCount: number;
  paidOrderCount: number;
  avgOrderCent: number;
  pendingCount: number;
  preparingCount: number;
  readyCount: number;
  cancelledCount: number;
  newCustomerCount: number;
  activeStoreCount: number;
}

export interface TrendPoint {
  date: string;
  revenueCent: number;
  orderCount: number;
}

export interface HourPoint {
  hour: number;
  orderCount: number;
  revenueCent: number;
}

export interface RankItem {
  id: number;
  name: string;
  valueCent: number;
  count: number;
}

export interface MixItem {
  key: string;
  label: string;
  count: number;
  valueCent: number;
}

export interface LiveOrder {
  orderNo: string;
  storeName: string;
  tableNo: string | null;
  pickupCode: string | null;
  diningType: number;
  status: number;
  payableCent: number;
  itemCount: number;
  itemsSummary: string;
  remark: string | null;
  createdAt: string;
  minutesAgo: number;
}

/** 商家端大屏 */
export interface MerchantScreenData {
  generatedAt: string;
  scopeName: string;
  overview: ScreenOverview;
  trend: TrendPoint[];
  hourly: HourPoint[];
  topDishes: RankItem[];
  storeRank: RankItem[];
  diningMix: MixItem[];
  liveOrders: LiveOrder[];
}

/** 平台端大屏 */
export interface PlatformScreenData {
  generatedAt: string;
  overview: ScreenOverview;
  totals: { merchants: number; stores: number; customers: number };
  trend: TrendPoint[];
  merchantRank: RankItem[];
  storeRank: RankItem[];
  channelMix: MixItem[];
  liveOrders: LiveOrder[];
}
