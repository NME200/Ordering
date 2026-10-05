/**
 * 分层角色（见 CODEBUDDY.md 8.2）。
 *
 * 平台管理员 / 平台运营专员 → 商户管理员 → 门店管理员 / 收银员。
 * C 端普通用户属于独立账号体系，后续单独建模，不混入本枚举。
 */
export enum Role {
  /** 平台管理员：唯一的授权方，可管理商户与平台账户，无租户归属 */
  PLATFORM_ADMIN = 'platform_admin',
  /**
   * 平台运营专员：平台侧的受派账号。
   *
   * 角色本身**不携带任何权限点**，能做什么完全由平台管理员在该账号的
   * `permissions` 上逐项授权（见 user.entity 的 permissions 列）。
   */
  PLATFORM_OPERATOR = 'platform_operator',
  /** 商户管理员：管理本商户下的门店与员工 */
  MERCHANT_ADMIN = 'merchant_admin',
  /** 门店管理员：管理本门店 */
  STORE_MANAGER = 'store_manager',
  /** 收银员：收银台操作 */
  CASHIER = 'cashier',
}

/** 角色中文名，用于日志与接口返回展示 */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: '平台管理员',
  [Role.PLATFORM_OPERATOR]: '平台运营专员',
  [Role.MERCHANT_ADMIN]: '商户管理员',
  [Role.STORE_MANAGER]: '门店管理员',
  [Role.CASHIER]: '收银员',
};

/** 角色枚举全部取值，供 DTO 校验使用 */
export const ROLE_VALUES: Role[] = Object.values(Role);
