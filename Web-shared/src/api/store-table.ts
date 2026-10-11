import type { StoreTable, UpsertStoreTablePayload } from '../types/store';
import { request } from '../utils/request';

/**
 * 门店台位（桌号）接口。
 *
 * 门店 ID 一律走路径：写别人的门店由服务端的门店范围校验挡掉。
 */

/** 某门店的台位列表 */
export function fetchStoreTables(storeId: number): Promise<StoreTable[]> {
  return request<StoreTable[]>({ url: `/stores/${storeId}/tables` });
}

/** 新增台位 */
export function createStoreTable(
  storeId: number,
  data: UpsertStoreTablePayload,
): Promise<StoreTable> {
  return request<StoreTable>({ url: `/stores/${storeId}/tables`, method: 'post', data });
}

/** 编辑台位（桌号 / 区域 / 启停 / 排序） */
export function updateStoreTable(
  storeId: number,
  id: number,
  data: UpsertStoreTablePayload,
): Promise<StoreTable> {
  return request<StoreTable>({ url: `/stores/${storeId}/tables/${id}`, method: 'put', data });
}

/** 删除台位（软删除，桌号之后可以复用） */
export function removeStoreTable(storeId: number, id: number): Promise<{ id: number }> {
  return request<{ id: number }>({ url: `/stores/${storeId}/tables/${id}`, method: 'delete' });
}
