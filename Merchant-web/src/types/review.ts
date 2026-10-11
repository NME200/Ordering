import type { PaginationQuery } from '@shared/types/api';

/**
 * 顾客评价 —— 与后端 `modules/review` 的出入参对齐。
 *
 * 评价挂在**已完成订单**上、一单一评，提交时赠送的积分（`pointAwarded`）
 * 是服务端算好的，这里只展示，不参与任何计算。
 */

/** 评价行（后端 ReviewDto） */
export interface ReviewRow {
  id: number;
  orderId: number;
  orderNo: string;
  storeId: number;
  /** 1~5 星 */
  rating: number;
  tags: string[];
  content: string | null;
  images: string[];
  /** 匿名时后端已把昵称打码 */
  anonymous: boolean;
  customerName: string;
  pointAwarded: number;
  replyContent: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** 评价列表查询：merchantId 由 Token 决定，商户侧一律不传 */
export interface ReviewQuery extends PaginationQuery {
  storeId?: number;
  /** 按星级筛选，1~5 */
  rating?: number;
  /** 只看未回复：后端判定的是 `=== 1`，不填即不限 */
  unrepliedOnly?: 1;
}
