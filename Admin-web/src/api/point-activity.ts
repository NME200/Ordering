import type { PaginatedData } from '@shared/types/api';
import type { PointActivity } from '@shared/types/point-activity';
import type { SavePointActivityPayload } from '@/types/point-activity';
import { request } from '@shared/utils/request';

/**
 * 积分活动管理接口（平台管理端专有）。
 *
 * 后端在控制器方法级挂了 `@Roles(PLATFORM_ADMIN)`，运营专员即便被授了别的点位也进不来：
 * 它决定的是全体顾客拿多少分。这里刻意没有「商户视角」的封装 —— 商户只读走
 * `GET /point-activities/effective`，由商户后台自己封装。
 */

/** 活动列表（带净发放分与参与人数） */
export function fetchPointActivities(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
  ruleType?: string;
}): Promise<PaginatedData<PointActivity>> {
  return request<PaginatedData<PointActivity>>({ url: '/point-activities', params });
}

/** 新建活动。后端固定落成「停用」，开活动是第二个动作 */
export function createPointActivity(data: SavePointActivityPayload): Promise<PointActivity> {
  return request<PointActivity>({ url: '/point-activities', method: 'post', data });
}

/** 编辑资料与规则（不含启停） */
export function updatePointActivity(
  id: number,
  data: Partial<SavePointActivityPayload>,
): Promise<PointActivity> {
  return request<PointActivity>({ url: `/point-activities/${id}`, method: 'put', data });
}

/**
 * 启用 / 停用。
 *
 * 独立接口，不与资料编辑混在一起（与门店启停同一口径）。
 * 启用可能得到 409：与另一个启用中的活动在商户范围上重叠。
 */
export function updatePointActivityStatus(id: number, status: number): Promise<PointActivity> {
  return request<PointActivity>({
    url: `/point-activities/${id}/status`,
    method: 'patch',
    data: { status },
  });
}

/** 删除活动；已发放过积分的会被后端按 409 拒掉 */
export function removePointActivity(id: number): Promise<void> {
  return request<void>({ url: `/point-activities/${id}`, method: 'delete' });
}
