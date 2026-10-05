import type { PaginatedData } from '../types/api';
import type {
  CreateDishPayload,
  Dish,
  DishQuery,
  UpdateDishPayload,
  UpdateDishStatusPayload,
} from '../types/dish';
import { request } from '../utils/request';

/** 分页查询菜品（含关联规格组） */
export function fetchDishes(params: DishQuery): Promise<PaginatedData<Dish>> {
  return request<PaginatedData<Dish>>({ url: '/dishes', params });
}

/** 查询菜品详情 */
export function fetchDish(id: number): Promise<Dish> {
  return request<Dish>({ url: `/dishes/${id}` });
}

/** 新增菜品 */
export function createDish(data: CreateDishPayload): Promise<Dish> {
  return request<Dish>({ url: '/dishes', method: 'post', data });
}

/** 编辑菜品 */
export function updateDish(id: number, data: UpdateDishPayload): Promise<Dish> {
  return request<Dish>({ url: `/dishes/${id}`, method: 'put', data });
}

/** 菜品上下架 */
export function updateDishStatus(id: number, data: UpdateDishStatusPayload): Promise<Dish> {
  return request<Dish>({ url: `/dishes/${id}/status`, method: 'put', data });
}

/** 删除菜品（软删除，同时解除规格组关联） */
export function removeDish(id: number): Promise<void> {
  return request<void>({ url: `/dishes/${id}`, method: 'delete' });
}
