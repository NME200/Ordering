import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { ApiResponse } from '../interfaces/api-response.interface';
import { BusinessException } from '../exceptions/business.exception';

/** MySQL 唯一索引冲突错误码 */
const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * 全局异常过滤器。
 *
 * 职责：
 * 1. 把任何异常统一转换为 `{ code, message, data: null }`；
 * 2. 同时给出合理的 HTTP 状态码，便于前端拦截器判断；
 * 3. **不向前端泄露堆栈**，堆栈只写服务端日志。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = this.resolve(exception);

    const logContext = `${request.method} ${request.originalUrl}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${logContext} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logContext} -> ${status} ${message}`);
    }

    const body: ApiResponse<null> = { code, message, data: null };
    response.status(status).json(body);
  }

  /** 把各类异常归一化为「HTTP 状态 + 业务错误码 + 可读提示」 */
  private resolve(exception: unknown): {
    status: HttpStatus;
    code: ErrorCode;
    message: string;
  } {
    // 1. 业务异常：错误码由抛出方指定
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }

    // 2. 数据库唯一索引冲突
    if (exception instanceof QueryFailedError) {
      const driverCode = (exception as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code;
      if (driverCode === MYSQL_DUPLICATE_ENTRY) {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: '数据已存在，请勿重复提交',
        };
      }
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.UNKNOWN,
        message: '数据操作失败',
      };
    }

    // 3. NestJS 内置异常（含 ValidationPipe 抛出的参数校验失败）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.mapStatusToCode(status),
        message: this.extractHttpMessage(exception),
      };
    }

    // 4. 兜底：未知异常，不暴露细节
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.UNKNOWN,
      message: '服务器内部错误',
    };
  }

  /** 提取 HttpException 的可读提示，兼容 ValidationPipe 返回字符串数组的情况 */
  private extractHttpMessage(exception: HttpException): string {
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload && typeof payload === 'object') {
      const message = (payload as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return exception.message;
  }

  /** HTTP 状态码 → 通用业务错误码 */
  private mapStatusToCode(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.PARAM_INVALID;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      default:
        return ErrorCode.UNKNOWN;
    }
  }
}
