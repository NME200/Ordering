import type { CommonStatus, Permission, Portal, Role } from './enums';

/** 登录入参 */
export interface LoginParams {
  username: string;
  password: string;
  /** 登录的客户端；由服务端校验端归属，不匹配直接拒登 */
  portal: Portal;
}

/** 当前登录账号信息（含权限点） */
export interface Profile {
  id: number;
  username: string;
  nickname: string;
  phone: string | null;
  role: Role;
  roleLabel: string;
  /** 平台管理员为 null */
  merchantId: number | null;
  storeId: number | null;
  status: CommonStatus;
  /** 供前端做菜单 / 按钮级展示控制；安全边界仍在服务端 */
  permissions: Permission[];
  /** 该账号允许登录的客户端列表 */
  portals: Portal[];
}

/** 登录成功返回 */
export interface LoginResult {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  user: Profile;
}

/** 修改本人密码入参 */
export interface ChangePasswordParams {
  oldPassword: string;
  newPassword: string;
}
