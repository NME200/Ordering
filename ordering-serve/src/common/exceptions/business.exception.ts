import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../shared/enums/error-code.enum';

/**
 * 业务异常。
 *
 * 与 HttpException 的区别：额外携带**业务错误码**，由全局异常过滤器
 * 统一转换为 `{ code, message, data }` 结构返回给前端。
 *
 * 用法：`throw BusinessException.notFound(ErrorCode.STORE_NOT_FOUND, '门店不存在');`
 */
export class BusinessException extends HttpException {
  /** 业务错误码 */
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
    this.code = code;
  }

  /** 资源不存在（HTTP 404） */
  static notFound(code: ErrorCode, message: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.NOT_FOUND);
  }

  /** 未登录 / 登录失效（HTTP 401） */
  static unauthorized(message = '未登录或登录已失效'): BusinessException {
    return new BusinessException(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  /** 无权限（HTTP 403） */
  static forbidden(message = '无权限访问该资源'): BusinessException {
    return new BusinessException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  /** 资源冲突，如重名（HTTP 409） */
  static conflict(code: ErrorCode, message: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.CONFLICT);
  }

  /** 参数不合法（HTTP 400） */
  static badRequest(code: ErrorCode, message: string): BusinessException {
    return new BusinessException(code, message, HttpStatus.BAD_REQUEST);
  }
}
