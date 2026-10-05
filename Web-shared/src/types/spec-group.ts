import type { PaginationQuery } from './api';
import type { CommonStatus, SpecType } from './enums';

/** 规格项 */
export interface SpecOption {
  id: number;
  name: string;
  /** 相对菜品基础价的增量（分），可为负 */
  priceDiff: number;
  sort: number;
  status: CommonStatus;
}

/** 规格组（含组内规格项） */
export interface SpecGroup {
  id: number;
  merchantId: number;
  name: string;
  type: SpecType;
  typeLabel: string;
  isRequired: boolean;
  sort: number;
  status: CommonStatus;
  options: SpecOption[];
  createdAt: string;
  updatedAt: string;
}

/** 规格组列表查询入参 */
export interface SpecGroupQuery extends PaginationQuery {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  keyword?: string;
  status?: CommonStatus;
}

/**
 * 规格项提交项。
 * 带 id 表示更新已有项，不带 id 表示新增；未提交的已有项将被删除。
 */
export interface SpecOptionItem {
  id?: number;
  name: string;
  priceDiff?: number;
  sort?: number;
  status?: CommonStatus;
}

/** 新增规格组入参（规格项一并提交，至少 1 项） */
export interface CreateSpecGroupPayload {
  /** 仅平台管理员可指定 */
  merchantId?: number;
  name: string;
  type: SpecType;
  isRequired?: boolean;
  sort?: number;
  status?: CommonStatus;
  options: SpecOptionItem[];
}

/** 编辑规格组入参（options 为整体覆盖语义，不传则保持原样） */
export interface UpdateSpecGroupPayload {
  name?: string;
  type?: SpecType;
  isRequired?: boolean;
  sort?: number;
  status?: CommonStatus;
  options?: SpecOptionItem[];
}
