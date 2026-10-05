import { HttpStatus } from '@nestjs/common';
import { isPlatformRole, isStoreBoundRole } from '../../shared/constants/role-scope';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { BusinessException } from '../exceptions/business.exception';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * 解析当前请求应使用的商户（租户）范围 —— 多租户隔离的核心入口。
 *
 * 规则（见 CODEBUDDY.md 8.1）：
 * - **平台侧角色**（平台管理员 / 运营专员）：可显式指定 merchantId 查看某个商户，不传则不限（跨租户）；
 * - **其余角色**：一律强制使用 Token 中的 merchantId，前端传入的值被忽略。
 *
 * @returns 需要过滤的 merchantId；返回 null 表示不加租户条件
 */
export function resolveMerchantScope(
  currentUser: AuthUser,
  requestedMerchantId?: number,
): number | null {
  if (isPlatformRole(currentUser.role)) {
    return requestedMerchantId ?? null;
  }

  if (currentUser.merchantId === null) {
    throw new BusinessException(
      ErrorCode.TENANT_CONTEXT_MISSING,
      '当前账号未归属任何商户，请联系平台管理员',
      HttpStatus.FORBIDDEN,
    );
  }

  // 关键：忽略 requestedMerchantId，只信 Token
  return currentUser.merchantId;
}

/**
 * 与 resolveMerchantScope 相同，但要求必须得到确定的商户 ID。
 * 用于「新增」这类必须落库到某个租户的场景。
 */
export function requireMerchantScope(
  currentUser: AuthUser,
  requestedMerchantId?: number,
): number {
  const merchantId = resolveMerchantScope(currentUser, requestedMerchantId);
  if (merchantId === null) {
    throw BusinessException.badRequest(
      ErrorCode.TENANT_CONTEXT_MISSING,
      '平台侧账号需显式指定 merchantId',
    );
  }
  return merchantId;
}

/**
 * 解析当前请求应使用的门店范围。
 *
 * - **门店绑定角色**（门店管理员 / 收银员）：强制限定为本人所属门店，
 *   前端传入的 storeId 一律忽略；账号未绑定门店时直接拒绝，**不放行成「不限」**；
 * - **其他角色**（商户管理员 / 平台管理员）：把传入的 storeId 当作可选筛选条件
 *   （不传表示不限，但仍受 merchantId 租户条件约束）。
 *
 * @returns 需要过滤的 storeId；返回 null 表示不加门店条件
 */
export function resolveStoreScope(
  currentUser: AuthUser,
  requestedStoreId?: number,
): number | null {
  if (isStoreBoundRole(currentUser.role)) {
    if (currentUser.storeId === null) {
      throw new BusinessException(
        ErrorCode.TENANT_CONTEXT_MISSING,
        '该账号未绑定门店，请联系管理员',
        HttpStatus.FORBIDDEN,
      );
    }
    return currentUser.storeId;
  }
  return requestedStoreId ?? null;
}
