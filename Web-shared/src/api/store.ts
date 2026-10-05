import type { PaginatedData } from '../types/api';
import type { CommonStatus } from '../types/enums';
import type {
  CreateStorePayload,
  Store,
  StoreQuery,
  UpdateStorePayload,
} from '../types/store';
import { request } from '../utils/request';

/** 分页查询门店列表 */
export function fetchStores(params: StoreQuery): Promise<PaginatedData<Store>> {
  return request<PaginatedData<Store>>({ url: '/stores', params });
}

/** 查询门店详情 */
export function fetchStore(id: number): Promise<Store> {
  return request<Store>({ url: `/stores/${id}` });
}

/** 新增门店 */
export function createStore(data: CreateStorePayload): Promise<Store> {
  return request<Store>({ url: '/stores', method: 'post', data });
}

/** 编辑门店资料（不含启停） */
export function updateStore(id: number, data: UpdateStorePayload): Promise<Store> {
  return request<Store>({ url: `/stores/${id}`, method: 'put', data });
}

/**
 * 禁用 / 恢复门店。
 *
 * 单独一个接口是因为归属规则是单向的：平台停用的门店商户解不开，
 * 服务端会返回 403，前端要提前把开关灰掉（见 views/store）。
 */
export function updateStoreStatus(id: number, status: CommonStatus): Promise<Store> {
  return request<Store>({ url: `/stores/${id}/status`, method: 'patch', data: { status } });
}

/** 删除门店（软删除） */
export function removeStore(id: number): Promise<void> {
  return request<void>({ url: `/stores/${id}`, method: 'delete' });
}

/**
 * 门店下拉选项（用于员工归属门店选择）。
 * 后端未提供 options 接口，这里取前 100 条。
 */
export async function fetchStoreOptions(merchantId?: number): Promise<Store[]> {
  const page = await fetchStores({ page: 1, pageSize: 100, merchantId, status: 1 });
  return page.list;
}
