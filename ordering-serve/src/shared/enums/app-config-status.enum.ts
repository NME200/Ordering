/**
 * 小程序布局配置的状态。
 *
 * 全平台同时只有一行 `published` 生效；编辑一律走草稿，
 * 发布时把旧的生效行转成 `archived` —— 回滚就是对 archived 行再次发布。
 */
export enum AppConfigStatus {
  /** 草稿：可继续编辑，C 端读不到 */
  DRAFT = 'draft',
  /** 已发布：C 端当前读到的那份 */
  PUBLISHED = 'published',
  /** 历史：被新发布顶下来的旧配置 */
  ARCHIVED = 'archived',
}

/** 状态中文名（列表页展示用） */
export const APP_CONFIG_STATUS_LABELS: Record<AppConfigStatus, string> = {
  [AppConfigStatus.DRAFT]: '草稿',
  [AppConfigStatus.PUBLISHED]: '生效中',
  [AppConfigStatus.ARCHIVED]: '历史版本',
};
