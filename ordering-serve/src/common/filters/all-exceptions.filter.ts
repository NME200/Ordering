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

    // 2. multer 的上传限制：这些不是「服务器内部错误」，用户需要知道自己该干什么
    const uploadProblem = this.resolveUploadProblem(exception);
    if (uploadProblem) {
      return uploadProblem;
    }

    // 3. 数据库唯一索引冲突
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

    // 4. NestJS 内置异常（含 ValidationPipe 抛出的参数校验失败）
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.mapStatusToCode(status),
        message: this.extractHttpMessage(exception),
      };
    }

    // 5. 兜底：未知异常，不暴露细节
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.UNKNOWN,
      message: '服务器内部错误',
    };
  }

  /**
   * 把上传被挡下来的几种形态统一成人话。
   *
   * 为什么要认三种：`FileInterceptor` 超限时报的不是原始 `MulterError`，
   * 而是被 platform-express 包过一层的 **413 HttpException**（实测 HTTP 413 + "File too large"）；
   * 字段名传错时又是 400 + "Unexpected file field"。都不认下来的话，用户会拿到
   * `code=10000 服务器内部错误` —— 而那恰恰是唯一一条他看了就知道该换张小图的信息。
   */
  private resolveUploadProblem(
    exception: unknown,
  ): { status: HttpStatus; code: ErrorCode; message: string } | null {
    const error = exception as {
      name?: string;
      code?: string;
      message?: string;
      getStatus?: () => number;
    };

    const message = String(error?.message ?? '');
    const multerCode = typeof error?.code === 'string' && error.name === 'MulterError' ? error.code : '';

    // 先判「没收到文件」：它和超限同为 multer 错误，别被下面的宽条件吞掉
    const noFile = multerCode === 'LIMIT_UNEXPECTED_FILE' || /unexpected file field/i.test(message);
    if (noFile) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.UPLOAD_FILE_REQUIRED,
        message: '没有收到文件：表单字段名必须是 file，且一次只能带一个文件',
      };
    }

    const tooLarge =
      multerCode === 'LIMIT_FILE_SIZE' ||
      /file too large/i.test(message) ||
      (exception instanceof HttpException &&
        exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE);
    if (tooLarge) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.UPLOAD_FILE_TOO_LARGE,
        message: '图片超出大小上限，请先压缩后再上传（长边控制在 2000px 以内就够用了）',
      };
    }

    return null;
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
