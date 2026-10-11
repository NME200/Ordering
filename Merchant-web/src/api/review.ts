import type { PaginatedData } from '@shared/types/api';
import { request } from '@shared/utils/request';
import type { ReviewQuery, ReviewRow } from '../types/review';

/** 评价列表：可按门店 / 星级 / 只看未回复筛选（租户范围由 Token 决定，不传 merchantId） */
export function fetchReviews(params: ReviewQuery): Promise<PaginatedData<ReviewRow>> {
  return request<PaginatedData<ReviewRow>>({ url: '/reviews', params });
}

/** 商家回复评价；一单一评，回复也只有一个，重复提交即覆盖 */
export function replyReview(id: number, content: string): Promise<ReviewRow> {
  return request<ReviewRow>({ url: `/reviews/${id}/reply`, method: 'post', data: { content } });
}
