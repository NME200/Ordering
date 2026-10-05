/**
 * 客户端（端）标识。
 *
 * 「端」与「角色」是两个正交维度，不要混为一谈：
 * - **端**回答「从哪个入口进来、看到什么信息架构」，由登录接口校验；
 * - **角色**回答「拥有哪些权限点、能调哪些接口」，由权限表决定。
 *
 * 一个账号可能属于多个端（例如门店管理员既要进商户后台，也要开收银台），
 * 但「商户管理员登录平台管理端」这种组合是不成立的，登录时会被拒绝。
 *
 * 各端对应的前端工程：
 * - `ADMIN`    → Admin-web（平台 / 管理后台）
 * - `MERCHANT` → Merchant-web（商户后台）
 * - `CASHIER`  → Cashier-web（收银台）
 */
export enum Portal {
  /** 平台管理端 */
  ADMIN = 'admin',
  /** 商户后台 */
  MERCHANT = 'merchant',
  /** 收银台 */
  CASHIER = 'cashier',
}

/** 端中文名，用于日志与错误提示 */
export const PORTAL_LABELS: Record<Portal, string> = {
  [Portal.ADMIN]: '平台管理端',
  [Portal.MERCHANT]: '商户后台',
  [Portal.CASHIER]: '收银台',
};

/** 端枚举全部取值，供 DTO 校验使用 */
export const PORTAL_VALUES: Portal[] = Object.values(Portal);
