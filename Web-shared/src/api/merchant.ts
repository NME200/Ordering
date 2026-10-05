import type { PaginatedData } from '../types/api';
import type {
  CreateMerchantPayload,
  Merchant,
  MerchantQuery,
  UpdateMerchantPayload,
} from '../types/merchant';
import { request } from '../utils/request';

/** 分页查询商户列表 */
export function fetchMerchants(params: MerchantQuery): Promise<PaginatedData<Merchant>> {
  return request<PaginatedData<Merchant>>({ url: '/merchants', params });
}

/** 查询商户详情 */
export function fetchMerchant(id: number): Promise<Merchant> {
  return request<Merchant>({ url: `/merchants/${id}` });
}

/** 新增商户 */
export function createMerchant(data: CreateMerchantPayload): Promise<Merchant> {
  return request<Merchant>({ url: '/merchants', method: 'post', data });
}

/** 编辑商户 */
export function updateMerchant(id: number, data: UpdateMerchantPayload): Promise<Merchant> {
  return request<Merchant>({ url: `/merchants/${id}`, method: 'put', data });
}

/** 删除商户（软删除） */
export function removeMerchant(id: number): Promise<void> {
  return request<void>({ url: `/merchants/${id}`, method: 'delete' });
}

/**
 * 商户下拉选项。
 * 后端未提供 options 接口，这里取前 100 条（平台下商户量级有限）。
 */
export async function fetchMerchantOptions(): Promise<Merchant[]> {
  const page = await fetchMerchants({ page: 1, pageSize: 100, status: 1 });
  return page.list;
}
