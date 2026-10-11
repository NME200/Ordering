import type { PaginationQuery } from './api';
import type { OrderSource, OrderStatus } from './enums';

/**
 * 订单相关类型 —— 与后端 `modules/order/dto` 对齐。
 *
 * 金额一律为**整数分**；订单明细里的菜品名与价格是**下单时的快照**，
 * 菜品后续改名 / 改价不会影响历史订单。
 */

/** 明细中所选规格的快照 */
export interface OrderItemSpec {
  specGroupId: number;
  specGroupName: string;
  specOptionId: number;
  specOptionName: string;
  /** 价格增量（分，快照） */
  priceDiff: number;
}

/** 订单明细 */
export interface OrderItem {
  id: number;
  dishId: number;
  /** 菜品名称（下单时快照） */
  dishName: string;
  dishImageUrl: string | null;
  /** 菜品基础单价（分，快照） */
  unitPrice: number;
  /** 规格增量合计（分/份） */
  specAmount: number;
  /** 规格摘要文字，如「大杯 / 加珍珠」 */
  specSummary: string;
  quantity: number;
  /** 小计（分） */
  subtotal: number;
  specs: OrderItemSpec[];
}

/** 订单 */
export interface Order {
  id: number;
  orderNo: string;
  merchantId: number;
  storeId: number;
  source: OrderSource;
  sourceLabel: string;
  /** 下单账号 ID；C 端扫码下单为 null */
  createdBy: number | null;
  createdByName: string | null;
  status: OrderStatus;
  statusLabel: string;
  /** 商品总额（分） */
  totalAmount: number;
  discountAmount: number;
  /** 应付金额（分） */
  payableAmount: number;
  /** 实付金额（分） */
  paidAmount: number | null;
  /** 商品总件数 */
  itemCount: number;
  customerName: string | null;
  customerPhone: string | null;
  tableNo: string | null;
  /** 取餐码：仅自提单有，顾客在柜台前报的就是它，店员按它找单 */
  pickupCode: string | null;
  remark: string | null;
  paidAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

/** 订单列表查询入参 */
export interface OrderQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  /** 门店管理员会被服务端强制限定为本店 */
  storeId?: number;
  status?: OrderStatus;
  /** 按订单号 / 手机号模糊搜索 */
  keyword?: string;
  /** 下单时间起（ISO 8601） */
  startTime?: string;
  /** 下单时间止（ISO 8601） */
  endTime?: string;
}

/** 订单状态计数 */
export interface OrderStatusCount {
  status: OrderStatus;
  statusLabel: string;
  count: number;
}

/** 取消 / 拒单入参 */
export interface CancelOrderPayload {
  reason?: string;
}

/** 收银台代客开单入参（POS） */
export interface CreatePosOrderItem {
  dishId: number;
  quantity: number;
  specOptionIds?: number[];
}

export interface CreatePosOrderPayload {
  /** 收银员 / 门店管理员可不传（取 Token 所属门店）；商户管理员必传 */
  storeId?: number;
  items: CreatePosOrderItem[];
  /** 幂等令牌，防止重复点击产生多单 */
  clientToken?: string;
  customerName?: string;
  customerPhone?: string;
  tableNo?: string;
  remark?: string;
}
