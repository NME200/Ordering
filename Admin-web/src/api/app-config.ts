import type { AppConfig, SaveAppConfigPayload } from '../types/app-config';
import { request } from '@shared/utils/request';

/**
 * 小程序布局配置接口（平台管理端专有）。
 *
 * 生命周期是「草稿 → 发布 → 历史」：编辑只能改草稿，
 * 发布时旧的生效行会被顶成历史，回滚就是对历史行再发布。
 */

/** 全部方案（含草稿与历史），生效中的排最前 */
export function fetchAppConfigs(): Promise<AppConfig[]> {
  return request<AppConfig[]>({ url: '/app-configs' });
}

/** 当前生效的方案；一行都没发布过时为 null */
export function fetchCurrentAppConfig(): Promise<AppConfig | null> {
  return request<AppConfig | null>({ url: '/app-configs/current' });
}

/** 新建草稿 */
export function createAppConfig(data: SaveAppConfigPayload): Promise<AppConfig> {
  return request<AppConfig>({ url: '/app-configs', method: 'post', data });
}

/** 覆盖草稿内容 */
export function updateAppConfig(id: number, data: SaveAppConfigPayload): Promise<AppConfig> {
  return request<AppConfig>({ url: `/app-configs/${id}`, method: 'put', data });
}

/** 发布：旧的转历史、版本号 +1；不完整时会被服务端拒并列出缺失项 */
export function publishAppConfig(id: number): Promise<AppConfig> {
  return request<AppConfig>({ url: `/app-configs/${id}/publish`, method: 'post' });
}

/** 删除草稿 */
export function removeAppConfig(id: number): Promise<void> {
  return request<void>({ url: `/app-configs/${id}`, method: 'delete' });
}
