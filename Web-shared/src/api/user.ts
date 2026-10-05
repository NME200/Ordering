import type { PaginatedData } from '../types/api';
import type {
  CreateUserPayload,
  ResetPasswordPayload,
  UpdateUserPayload,
  User,
  UserQuery,
} from '../types/user';
import { request } from '../utils/request';

/** 分页查询账号（平台端用 accountKind 区分平台账户 / 商家账户） */
export function fetchUsers(params: UserQuery): Promise<PaginatedData<User>> {
  return request<PaginatedData<User>>({ url: '/users', params });
}

/** 查询账号详情 */
export function fetchUser(id: number): Promise<User> {
  return request<User>({ url: `/users/${id}` });
}

/** 新增账号 */
export function createUser(data: CreateUserPayload): Promise<User> {
  return request<User>({ url: '/users', method: 'post', data });
}

/** 编辑账号（平台端对商家账号仅可变更 status） */
export function updateUser(id: number, data: UpdateUserPayload): Promise<User> {
  return request<User>({ url: `/users/${id}`, method: 'put', data });
}

/** 重置账号密码（会使该账号已登录的会话全部失效） */
export function resetUserPassword(id: number, data: ResetPasswordPayload): Promise<void> {
  return request<void>({ url: `/users/${id}/password`, method: 'put', data });
}

/** 删除账号（软删除） */
export function removeUser(id: number): Promise<void> {
  return request<void>({ url: `/users/${id}`, method: 'delete' });
}
