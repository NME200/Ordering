import type { StoreDishOverride, UpsertStoreDishPayload } from '../types/store-dish';
import { request } from '../utils/request';

/**
 * 门店菜品例外接口。
 *
 * 读侧刻意不开「有效菜单」端点：`GET /dishes?storeId=` 已返回合并后的门店有效值，
 * 再给一份只会造出第二套口径。
 */

/**
 * 设置本店例外（停售 / 门店价 / 沽清）。
 *
 * 全部改回默认值时后端会删掉这行并返回 null —— 即恢复跟随标准菜单。
 * 门店账号只能设停售与沽清，价格字段由商户管理员维护。
 */
export function upsertStoreDish(
  storeId: number,
  dishId: number,
  data: UpsertStoreDishPayload,
): Promise<StoreDishOverride | null> {
  return request<StoreDishOverride | null>({
    url: `/store-dishes/${storeId}/${dishId}`,
    method: 'put',
    data,
  });
}

/** 删除本店例外，恢复跟随标准菜单 */
export function resetStoreDish(storeId: number, dishId: number): Promise<void> {
  return request<void>({ url: `/store-dishes/${storeId}/${dishId}`, method: 'delete' });
}
