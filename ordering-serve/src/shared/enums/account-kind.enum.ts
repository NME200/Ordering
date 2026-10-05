/**
 * 平台管理端「账户管理」的分类口径。
 *
 * 平台端把账号分成两类分开治理，而不是铺成一张全量大列表：
 * - `PLATFORM`：平台自己的账号（平台管理员 + 运营专员）；
 * - `MERCHANT_ADMIN`：各商户的管理员账号，即商家在商户后台的开户主体。
 *
 * 门店管理员与收银员**不在此列** —— 那是商家的员工，由商家在商户后台自行创建，
 * 平台只在「商户管理 → 查看详情 → 员工账号」里按需下钻查看与处置。
 *
 * 用分类而不是让前端直接传 role 列表：分类的口径只有一份，落在服务端。
 */
export enum AccountKind {
  /** 平台账户 */
  PLATFORM = 'platform',
  /** 商家账户（商户管理员） */
  MERCHANT_ADMIN = 'merchant_admin',
}

/** 账户分类全部取值，供 DTO 校验使用 */
export const ACCOUNT_KIND_VALUES: AccountKind[] = Object.values(AccountKind);
