import type { PaginatedData } from '../types/api';
import { request } from '../utils/request';

/**
 * 工作台概览统计。
 *
 * 后端暂未提供聚合统计接口，这里复用各模块的分页接口只取 `total`：
 * 请求 `pageSize=1`，并以静默模式发起，避免个别接口失败时刷屏提示。
 */
async function fetchTotal(url: string, params?: Record<string, unknown>): Promise<number> {
  const page = await request<PaginatedData<unknown>>({
    url,
    params: { page: 1, pageSize: 1, ...params },
    silent: true,
  });
  return page.total;
}

/** 商户总数（仅平台管理员有权限） */
export function fetchMerchantTotal(): Promise<number> {
  return fetchTotal('/merchants');
}

/** 门店总数（当前租户范围） */
export function fetchStoreTotal(): Promise<number> {
  return fetchTotal('/stores');
}

/** 员工账号总数（当前可见范围） */
export function fetchUserTotal(): Promise<number> {
  return fetchTotal('/users');
}

/** 菜品总数（当前租户范围） */
export function fetchDishTotal(): Promise<number> {
  return fetchTotal('/dishes');
}

/** 菜品分类总数（当前租户范围） */
export function fetchDishCategoryTotal(): Promise<number> {
  return fetchTotal('/dish-categories');
}

/** 规格组总数（当前租户范围） */
export function fetchSpecGroupTotal(): Promise<number> {
  return fetchTotal('/spec-groups');
}
