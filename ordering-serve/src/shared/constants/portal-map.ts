import { Portal } from '../enums/portal.enum';
import { Role } from '../enums/role.enum';

/**
 * 角色 → 允许登录的端。
 *
 * 这是「端归属」的唯一判定依据：登录时校验，角色不在该端则直接拒登。
 * 前端隐藏入口只是体验优化，**拒登必须发生在服务端**。
 *
 * 调整说明：
 * - 门店管理员同时允许进入收银台（门店管理者常需替班收银）；
 *   若不需要，把 `Portal.CASHIER` 去掉即可，无需改动其它代码。
 * - 平台管理员**只能**进平台管理端，不能进商户后台与收银台。
 */
export const ROLE_PORTALS: Record<Role, Portal[]> = {
  [Role.PLATFORM_ADMIN]: [Portal.ADMIN],
  [Role.PLATFORM_OPERATOR]: [Portal.ADMIN],
  [Role.MERCHANT_ADMIN]: [Portal.MERCHANT],
  [Role.STORE_MANAGER]: [Portal.MERCHANT, Portal.CASHIER],
  [Role.CASHIER]: [Portal.CASHIER],
};

/** 获取某角色允许登录的全部端 */
export function getPortalsByRole(role: Role): Portal[] {
  return ROLE_PORTALS[role] ?? [];
}

/** 判断某角色是否允许登录指定端 */
export function isRoleAllowedInPortal(role: Role, portal: Portal): boolean {
  return getPortalsByRole(role).includes(portal);
}
