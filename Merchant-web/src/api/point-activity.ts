import type { PointActivity } from '@shared/types/point-activity';
import { request } from '@shared/utils/request';

/**
 * 平台积分活动（商户侧只读）。
 *
 * 只有 `GET /point-activities/effective` 这一个入口：租户由服务端从 Token 取，
 * 读的是「本店此刻参与中的活动」。新建 / 编辑 / 启停 / 删除都不在这里 ——
 * 规则归平台配，商户改动自己家的菜单与门店就好。
 */
export function fetchEffectiveActivities(): Promise<PointActivity[]> {
  return request<PointActivity[]>({ url: '/point-activities/effective' });
}
