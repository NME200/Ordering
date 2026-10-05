import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';

/**
 * 请求上下文中的登录用户信息。
 *
 * 由 JwtStrategy 从 Token 解析并挂载到 request.user，
 * 通过 @CurrentUser() 装饰器注入到 Controller。
 *
 * 关键点（见 CODEBUDDY.md 8.1）：
 * merchantId / storeId 只来自服务端解析的 Token，**绝不接受前端传入**。
 */
export interface AuthUser {
  /** 用户 ID */
  userId: number;
  /** 登录用户名 */
  username: string;
  /** 姓名 / 昵称，用于业务快照（如订单的操作人） */
  nickname: string;
  /** 角色 */
  role: Role;
  /** 所属商户 ID；平台侧账号为 null */
  merchantId: number | null;
  /** 所属门店 ID；商户管理员可为 null */
  storeId: number | null;
  /**
   * 该账号本次请求的有效权限点。
   *
   * 由 JwtStrategy 每次请求从数据库现值算出（角色默认 或 账号级授权清单），
   * 因此授权变更即时生效，不依赖 Token 重签。
   */
  permissions: Permission[];
  /** Token 唯一标识，用于登出 / 失效控制 */
  jti: string;
}
