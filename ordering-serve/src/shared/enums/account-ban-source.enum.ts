/**
 * 账号封禁的发起方。
 *
 * 封禁是「谁封的谁解」：平台替商家止血之后，商家不该能自己把号放回来，
 * 否则平台的封禁形同虚设；反过来商家内部停的号，平台也不该去覆盖人家的用工决定。
 * 因此封禁必须记录发起方，而不是只看 `status` 这一个开关。
 */
export enum AccountBanSource {
  /** 平台侧账号（平台管理员 / 运营专员）发起的封禁 */
  PLATFORM = 'platform',
  /** 商户侧账号（商户管理员 / 门店管理员）发起的封禁 */
  MERCHANT = 'merchant',
}

/** 封禁方中文名，用于拒绝解封时的提示 */
export const BAN_SOURCE_LABELS: Record<AccountBanSource, string> = {
  [AccountBanSource.PLATFORM]: '平台',
  [AccountBanSource.MERCHANT]: '商户',
};
