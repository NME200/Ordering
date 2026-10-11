import type { PaginatedData } from '@shared/types/api';
import { request } from '@shared/utils/request';
import type {
  CouponPayload,
  CouponQuery,
  CouponTemplate,
  CouponTemplateStatus,
  CustomerCouponRecord,
} from '../types/coupon';

/**
 * 优惠券接口（商户后台）。
 *
 * 一个字段都不要传 `merchantId`：写路径的归属由服务端按 Token 推导，
 * 商户传了也会被忽略，留在代码里只会误导后人「这里能改归属」。
 */

/** 本店券模板列表 */
export function fetchCoupons(params: CouponQuery): Promise<PaginatedData<CouponTemplate>> {
  return request<PaginatedData<CouponTemplate>>({ url: '/coupons', params });
}

/** 新建券模板 */
export function createCoupon(data: CouponPayload): Promise<CouponTemplate> {
  return request<CouponTemplate>({ url: '/coupons', method: 'post', data });
}

/** 修改券模板（覆盖整条配置） */
export function updateCoupon(id: number, data: CouponPayload): Promise<CouponTemplate> {
  return request<CouponTemplate>({ url: `/coupons/${id}`, method: 'put', data });
}

/** 上架 / 下架。下架不回收已发出的券 —— 那是顾客资产 */
export function updateCouponStatus(
  id: number,
  status: CouponTemplateStatus,
): Promise<CouponTemplate> {
  return request<CouponTemplate>({
    url: `/coupons/${id}/status`,
    method: 'put',
    params: { status },
  });
}

/** 删除券模板；已有人领取过会被服务端拒绝，只能改为下架 */
export function removeCoupon(id: number): Promise<void> {
  return request<void>({ url: `/coupons/${id}`, method: 'delete' });
}

/** 某张券的发放与核销记录 */
export function fetchCouponRecords(
  id: number,
  params: { page: number; pageSize: number },
): Promise<PaginatedData<CustomerCouponRecord>> {
  return request<PaginatedData<CustomerCouponRecord>>({
    url: `/coupons/${id}/records`,
    params,
  });
}
