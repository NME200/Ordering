import type { PaginationQuery } from './api';
import type { AccountBanSource, AccountKind, CommonStatus, Permission, Role } from './enums';

/** 账号（不含密码等敏感字段） */
export interface User {
  id: number;
  /** 平台侧账号为 null */
  merchantId: number | null;
  storeId: number | null;
  username: string;
  nickname: string;
  phone: string | null;
  role: Role;
  roleLabel: string;
  status: CommonStatus;
  /** 封禁发起方；启用状态下为 null。非本方封禁时前端要把解封开关禁掉 */
  bannedBy: AccountBanSource | null;
  /** 账号级授权清单；null 表示沿用角色默认权限（非运营专员恒为 null） */
  permissions: Permission[] | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 账号列表查询入参 */
export interface UserQuery extends PaginationQuery {
  /** 仅平台侧角色可指定 */
  merchantId?: number;
  storeId?: number;
  keyword?: string;
  role?: Role;
  /** 平台端「平台账户 / 商家账户」两个页签的分类 */
  accountKind?: AccountKind;
  status?: CommonStatus;
}

/** 新增账号入参（无 merchantId：商家账号落在操作者自己的商户，平台账号无租户归属） */
export interface CreateUserPayload {
  /** 门店管理员 / 收银员必填 */
  storeId?: number;
  username: string;
  password: string;
  nickname: string;
  phone?: string;
  role: Role;
  /** 仅平台运营专员需要 */
  permissions?: Permission[];
}

/** 编辑账号入参（用户名不可改，密码走独立接口） */
export interface UpdateUserPayload {
  nickname?: string;
  phone?: string;
  role?: Role;
  storeId?: number;
  status?: CommonStatus;
  /** 仅平台管理员可写给平台运营专员 */
  permissions?: Permission[];
}

/** 重置密码入参 */
export interface ResetPasswordPayload {
  newPassword: string;
}
