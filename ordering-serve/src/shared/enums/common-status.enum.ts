/**
 * 通用启用 / 禁用状态。
 * 与数据库 tinyint(1) 对应，避免各处直接写 0 / 1 魔法数字。
 */
export enum CommonStatus {
  /** 禁用 */
  DISABLED = 0,
  /** 启用 */
  ENABLED = 1,
}
