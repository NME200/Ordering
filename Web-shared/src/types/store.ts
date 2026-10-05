import type { PaginationQuery } from './api';
import type { AccountBanSource, BusinessStatus, CommonStatus } from './enums';

/** 门店 */
export interface Store {
  id: number;
  merchantId: number;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  businessStatus: BusinessStatus;
  status: CommonStatus;
  /** 停用发起方；启用时为 null。平台停用的店商户解不开，开关要提前灰掉 */
  bannedBy: AccountBanSource | null;
  createdAt: string;
  updatedAt: string;
}

/** 门店列表查询入参 */
export interface StoreQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  keyword?: string;
  status?: CommonStatus;
}

/** 新增门店入参 */
export interface CreateStorePayload {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  businessStatus?: BusinessStatus;
}

/**
 * 编辑门店入参 —— 只有资料字段。
 * 不含 merchantId（门店不允许跨租户迁移），也不含 status
 * （启停是治理动作，走 updateStoreStatus 单独校验 `store:disable`）。
 */
export type UpdateStorePayload = Partial<Omit<CreateStorePayload, 'merchantId'>>;
