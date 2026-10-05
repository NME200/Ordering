import type { PaginationQuery } from './api';
import type { DishStatus } from './enums';
import type { SpecGroup } from './spec-group';
import type { StoreDishOverride } from './store-dish';

/** 菜品（列表与详情返回中均带关联规格组） */
export interface Dish {
  id: number;
  merchantId: number;
  categoryId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** 售价（分） */
  price: number;
  /** 会员价（分），null 表示不区分 */
  memberPrice: number | null;
  /** 归属门店：null = 全商户通用，非 null = 该店专属 */
  storeId: number | null;
  /**
   * 以下四项是**按查询门店合并例外后的有效值**。
   * 未指定门店时等于标准值本身，因此调用方可无条件读取。
   */
  effectivePrice: number;
  effectiveMemberPrice: number | null;
  /** 本店当前能不能点（综合上下架、本店停售与沽清） */
  onSale: boolean;
  soldOut: boolean;
  /** 本店对这道菜是否存在例外记录 */
  overridden: boolean;
  /**
   * 本店例外的原始值（未指定门店时为 null）。
   * 开关要绑这里而不是绑 `onSale`，否则会出现「拨回来了但显示没变」。
   */
  storeOverride: StoreDishOverride | null;
  unit: string;
  sort: number;
  status: DishStatus;
  statusLabel: string;
  isRecommend: boolean;
  soldCount: number;
  specGroups: SpecGroup[];
  createdAt: string;
  updatedAt: string;
}

/** 菜品列表查询入参 */
export interface DishQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  /** 按门店查看：决定店专属菜可见性与有效价；门店绑定角色由服务端强制为本店 */
  storeId?: number;
  categoryId?: number;
  keyword?: string;
  status?: DishStatus;
  isRecommend?: boolean;
}

/** 新增菜品入参 */
export interface CreateDishPayload {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  categoryId: number;
  /** 归属门店：不传 = 全商户通用，传了 = 该店专属 */
  storeId?: number;
  name: string;
  description?: string;
  imageUrl?: string;
  /** 售价（分） */
  price: number;
  /** 会员价（分）；传 null 表示不区分会员价 */
  memberPrice?: number | null;
  unit?: string;
  sort?: number;
  status?: DishStatus;
  isRecommend?: boolean;
  /** 关联的规格组 ID（必须是本商户已存在的规格组） */
  specGroupIds?: number[];
}

/**
 * 编辑菜品入参（所有字段可选）。
 * 不含 merchantId（不跨租户迁移）与 storeId（店专属归属创建时定死，改它应当是
 * 一个单独的「转正 / 下放」动作，不是编辑接口顺带改掉）。
 */
export type UpdateDishPayload = Partial<Omit<CreateDishPayload, 'merchantId' | 'storeId'>>;

/** 菜品上下架入参 */
export interface UpdateDishStatusPayload {
  status: DishStatus;
}
