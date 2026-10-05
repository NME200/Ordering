import type { PaginationQuery } from './api';
import type { CommonStatus } from './enums';

/** 商户（租户） */
export interface Merchant {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  status: CommonStatus;
  /** ISO 8601；null 表示不限 */
  expireAt: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 商户列表查询入参 */
export interface MerchantQuery extends PaginationQuery {
  keyword?: string;
  status?: CommonStatus;
}

/** 商户资料（新增与编辑共用的字段） */
interface MerchantProfile {
  name: string;
  contactName?: string;
  contactPhone?: string;
  /** ISO 8601；传 null 表示不限 */
  expireAt?: string | null;
  remark?: string;
}

/**
 * 新增商户入参。
 * 必须一并给出首个商家管理员的凭据：平台开通商户就要让它能立刻登录，
 * 此后的商家员工由商家在商户后台自行开通。
 */
export interface CreateMerchantPayload extends MerchantProfile {
  adminUsername: string;
  adminPassword: string;
  adminNickname: string;
  adminPhone?: string;
}

/** 编辑商户入参（管理员账号不在商户资料里，走账号管理的重置 / 封禁） */
export interface UpdateMerchantPayload extends Partial<MerchantProfile> {
  status?: CommonStatus;
}
