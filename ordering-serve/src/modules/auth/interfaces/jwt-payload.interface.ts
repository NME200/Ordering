import { Role } from '../../../shared/enums/role.enum';

/**
 * JWT 载荷结构。
 *
 * 注意：这里携带的 merchantId / storeId 是**服务端签发**的租户上下文，
 * 后续所有请求的租户范围都以它为准（见 CODEBUDDY.md 8.1）。
 */
export interface JwtPayload {
  /** 账号 ID（JWT 标准字段 subject） */
  sub: number;
  /** 登录用户名 */
  username: string;
  /** 角色 */
  role: Role;
  /** 所属商户 ID；平台管理员为 null */
  merchantId: number | null;
  /** 所属门店 ID */
  storeId: number | null;
  /**
   * 会话版本号，取自 users.token_version。
   * 重置密码 / 强制下线会让该列自增，从而使此前签发的所有 Token 失效。
   */
  tokenVersion: number;
  /** Token 唯一标识，用于登出 / 改密后使其失效 */
  jti: string;
}
