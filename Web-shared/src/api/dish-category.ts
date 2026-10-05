import type { PaginatedData } from '../types/api';
import type {
  CreateDishCategoryPayload,
  DishCategory,
  DishCategoryQuery,
  UpdateDishCategoryPayload,
} from '../types/dish-category';
import { request } from '../utils/request';

/** 分页查询菜品分类 */
export function fetchDishCategories(
  params: DishCategoryQuery,
): Promise<PaginatedData<DishCategory>> {
  return request<PaginatedData<DishCategory>>({ url: '/dish-categories', params });
}

/** 查询全部分类（不分页，供下拉选择）。传 storeId 时同时给出该店的专属分类 */
export function fetchDishCategoryOptions(
  merchantId?: number,
  storeId?: number,
): Promise<DishCategory[]> {
  return request<DishCategory[]>({
    url: '/dish-categories/options',
    params: { merchantId, storeId },
  });
}

/** 查询菜品分类详情 */
export function fetchDishCategory(id: number): Promise<DishCategory> {
  return request<DishCategory>({ url: `/dish-categories/${id}` });
}

/** 新增菜品分类 */
export function createDishCategory(data: CreateDishCategoryPayload): Promise<DishCategory> {
  return request<DishCategory>({ url: '/dish-categories', method: 'post', data });
}

/** 编辑菜品分类 */
export function updateDishCategory(
  id: number,
  data: UpdateDishCategoryPayload,
): Promise<DishCategory> {
  return request<DishCategory>({ url: `/dish-categories/${id}`, method: 'put', data });
}

/** 删除菜品分类（软删除，分类下有菜品时会被后端拒绝） */
export function removeDishCategory(id: number): Promise<void> {
  return request<void>({ url: `/dish-categories/${id}`, method: 'delete' });
}
