import type { Popup, SavePopupPayload } from '../types/app-config';
import { request } from '@shared/utils/request';

/**
 * 活动弹窗管理接口（平台管理端专有）。
 *
 * 弹窗直接糊在全体顾客屏幕上，权限点与布局配置同档：
 * `@Roles(PLATFORM_ADMIN)` 硬锁，不进可授权白名单。
 */

/** 弹窗列表，按优先级升序，每条带曝光与点击数据 */
export function fetchPopups(): Promise<Popup[]> {
  return request<Popup[]>({ url: '/popups' });
}

/** 新建弹窗（保存即生效，靠 status 与生效时间控制上下线） */
export function createPopup(data: SavePopupPayload): Promise<Popup> {
  return request<Popup>({ url: '/popups', method: 'post', data });
}

/** 覆盖整条配置（启停与生效时间也走这里） */
export function updatePopup(id: number, data: SavePopupPayload): Promise<Popup> {
  return request<Popup>({ url: `/popups/${id}`, method: 'put', data });
}

/** 删除弹窗；展示日志保留 */
export function removePopup(id: number): Promise<void> {
  return request<void>({ url: `/popups/${id}`, method: 'delete' });
}
