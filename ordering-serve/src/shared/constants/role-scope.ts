import { Role } from '../enums/role.enum';

/**
 * 必须绑定具体门店的角色。
 *
 * 这些角色的数据范围被**强制限定在所属门店**：
 * - 前端传入的 storeId 一律被忽略（防止跨店读取）；
 * - 账号本身没有门店归属时直接拒绝访问，而**不是**退化成「不限门店」
 *   —— 那样会造成整个商户的数据泄露。
 *
 * 注意：这里是「门店绑定」的唯一判定依据，租户范围解析（tenant.util）与
 * 账号归属校验（user.service）都必须引用它，避免两处口径不一致。
 */
export const STORE_BOUND_ROLES: Role[] = [Role.STORE_MANAGER, Role.CASHIER];

/** 判断角色是否必须绑定门店 */
export function isStoreBoundRole(role: Role): boolean {
  return STORE_BOUND_ROLES.includes(role);
}

/**
 * 平台侧角色：不属于任何租户（merchant_id 为 NULL），可在平台管理端登录。
 *
 * 这是「跨租户可见」的唯一判定依据：租户范围解析（tenant.util）与
 * 账户归属校验（user.service）都必须引用它。
 *
 * 注意与「谁能授权」区分开：只有 PLATFORM_ADMIN 能维护平台账户与权限点，
 * 运营专员虽属平台侧，但本身就是被管理的对象。
 */
export const PLATFORM_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.PLATFORM_OPERATOR];

/** 判断角色是否属于平台侧 */
export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

/**
 * 角色层级：数值越大权限越高。
 *
 * 用于「操作者只能分配不高于自身的角色」这条约束 —— 没有它，
 * 拥有 `user:update` 的门店管理员就能把本店收银员提为商户管理员，
 * 从而取得整个商户的经营权限（权限点从 13 涨到 26）。
 */
export const ROLE_LEVEL: Record<Role, number> = {
  [Role.PLATFORM_ADMIN]: 100,
  [Role.PLATFORM_OPERATOR]: 90,
  [Role.MERCHANT_ADMIN]: 60,
  [Role.STORE_MANAGER]: 40,
  [Role.CASHIER]: 20,
};

/**
 * 判断操作者能否把目标角色分配给他人。
 *
 * 允许同级（商户管理员再开一个商户管理员是合理诉求）与下级，
 * 禁止任何向上分配。
 */
export function canAssignRole(target: Role, operator: Role): boolean {
  return ROLE_LEVEL[target] <= ROLE_LEVEL[operator];
}
