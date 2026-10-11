import type { MiniappConfig, MiniappTestResult, SaveMiniappConfigPayload } from '../types/miniapp';
import { request } from '@shared/utils/request';

/**
 * 小程序凭据接口（平台管理端专有）。
 *
 * 与支付配置同档：AppSecret 能换到调用微信接口的 access_token，
 * 后端用 `@Roles(PLATFORM_ADMIN)` 硬锁，不进可授权白名单。
 */

/** 当前凭据（AppSecret 只回「是否已配置」） */
export function fetchMiniappConfig(): Promise<MiniappConfig> {
  return request<MiniappConfig>({ url: '/miniapp/config' });
}

/** 保存凭据 */
export function saveMiniappConfig(data: SaveMiniappConfigPayload): Promise<MiniappConfig> {
  return request<MiniappConfig>({ url: '/miniapp/config', method: 'put', data });
}

/** 用已存凭据换一次 access_token，验证配置真的能用 */
export function testMiniappConfig(): Promise<MiniappTestResult> {
  return request<MiniappTestResult>({ url: '/miniapp/config/test', method: 'post' });
}
