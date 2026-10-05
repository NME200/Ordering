import type { ChangePasswordParams, LoginParams, LoginResult, Profile } from '../types/auth';
import { request } from '../utils/request';

/** 账号登录 */
export function login(data: LoginParams): Promise<LoginResult> {
  return request<LoginResult>({ url: '/auth/login', method: 'post', data });
}

/** 获取当前登录账号信息与权限点 */
export function fetchProfile(): Promise<Profile> {
  return request<Profile>({ url: '/auth/profile', method: 'get' });
}

/** 退出登录（当前 Token 立即失效） */
export function logout(): Promise<void> {
  return request<void>({ url: '/auth/logout', method: 'post' });
}

/** 修改本人密码（修改后需重新登录） */
export function changePassword(data: ChangePasswordParams): Promise<void> {
  return request<void>({ url: '/auth/password', method: 'put', data });
}
