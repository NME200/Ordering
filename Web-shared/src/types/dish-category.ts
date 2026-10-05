import type { PaginationQuery } from './api';
import type { CommonStatus } from './enums';

/** 菜品分类 */
export interface DishCategory {
  id: number;
  merchantId: number;
  name: string;
  /** 归属门店：null = 全商户通用，非 null = 该店专属分类 */
  storeId: number | null;
  /** 越小越靠前 */
  sort: number;
  status: CommonStatus;
  createdAt: string;
  updatedAt: string;
}

/** 菜品分类列表查询入参 */
export interface DishCategoryQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  /** 按门店查看（门店绑定角色由服务端强制为本店） */
  storeId?: number;
  keyword?: string;
  status?: CommonStatus;
}

/** 新增菜品分类入参 */
export interface CreateDishCategoryPayload {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  name: string;
  /** 归属门店：不传 = 全商户通用，传了 = 该店专属 */
  storeId?: number;
  sort?: number;
  status?: CommonStatus;
}

/** 编辑菜品分类入参（所有字段可选） */
export type UpdateDishCategoryPayload = Partial<Omit<CreateDishCategoryPayload, 'merchantId'>>;
