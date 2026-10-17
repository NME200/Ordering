import { request } from '../utils/request';
import type { MerchantScreenData, PlatformScreenData } from '../types/statistics';

/**
 * 大屏接口。
 *
 * `silent: true`：屏是每 10 秒自己刷的，网络抖一下不该弹一条错误打扰看屏的人 ——
 * 失败由轮询 hook 记在角标上（「数据更新于 xx:xx」变灰 + 一行小字），画面保留上一次的值。
 */

export function fetchMerchantScreen(): Promise<MerchantScreenData> {
  return request<MerchantScreenData>({ url: '/statistics/merchant-screen', silent: true });
}

export function fetchPlatformScreen(): Promise<PlatformScreenData> {
  return request<PlatformScreenData>({ url: '/statistics/platform-screen', silent: true });
}
