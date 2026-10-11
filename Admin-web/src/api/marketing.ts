import type { PaginatedData } from '@shared/types/api';
import { CommonStatus } from '@shared/types/enums';
import { request } from '@shared/utils/request';
import type {
  CouponQuery,
  CouponTemplate,
  CouponTemplateStatus,
  IssuedCoupon,
  CustomerQuery,
  CustomerRow,
  UpsertCouponPayload,
} from '../types/marketing';

/**
 * 券与顾客的接口封装（平台管理端）。
 *
 * 后端把这两个域的读写做成同一套接口给商户端与平台端共用，
 * 归属由**服务端按角色推导**：平台侧写路径固定 merchantId = null（全场通用券），
 * 所以这里没有任何一个函数需要传归属 —— 传了也不认，越界一律按「不存在」处理。
 */

/* ---------------- 优惠券模板 ---------------- */

/** 券模板列表；平台默认可见全部（含各商户的券），可用 merchantId / platformOnly 收窄 */
export function fetchCoupons(params: CouponQuery): Promise<PaginatedData<CouponTemplate>> {
  return request<PaginatedData<CouponTemplate>>({ url: '/coupons', params });
}

/** 新建券模板（平台券） */
export function createCoupon(data: UpsertCouponPayload): Promise<CouponTemplate> {
  return request<CouponTemplate>({ url: '/coupons', method: 'post', data });
}

/** 覆盖整条模板（PUT 是全量 upsert，缺字段等于改没了） */
export function updateCoupon(id: number, data: UpsertCouponPayload): Promise<CouponTemplate> {
  return request<CouponTemplate>({ url: `/coupons/${id}`, method: 'put', data });
}

/** 上架 / 下架；下架不回收已发出的券 —— 那是顾客资产 */
export function updateCouponStatus(id: number, status: CouponTemplateStatus): Promise<CouponTemplate> {
  return request<CouponTemplate>({ url: `/coupons/${id}/status`, method: 'put', params: { status } });
}

/** 删除模板；已有人领取会被拒（请改为下架） */
export function removeCoupon(id: number): Promise<void> {
  return request<void>({ url: `/coupons/${id}`, method: 'delete' });
}

/** 某张券的发放与核销记录 */
export function fetchCouponRecords(
  id: number,
  params: { page: number; pageSize: number },
): Promise<PaginatedData<IssuedCoupon>> {
  return request<PaginatedData<IssuedCoupon>>({ url: `/coupons/${id}/records`, params });
}

/* ---------------- 顾客 ---------------- */

/**
 * 顾客列表。
 *
 * 顾客账号是全平台账号，封禁 / 解封只有平台能做（商户端已经没有这个页面）。
 */
export function fetchCustomers(params: CustomerQuery): Promise<PaginatedData<CustomerRow>> {
  return request<PaginatedData<CustomerRow>>({ url: '/customers', params });
}

/** 封禁 / 解封顾客。状态走 query，与后端 `PUT /customers/:id/status?status=0|1` 对齐 */
export function updateCustomerStatus(id: number, status: CommonStatus): Promise<void> {
  return request<void>({ url: `/customers/${id}/status`, method: 'put', params: { status } });
}
