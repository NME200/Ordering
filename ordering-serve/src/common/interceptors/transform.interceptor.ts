import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * 统一响应拦截器。
 *
 * 把 Controller 的返回值包装为 `{ code: 0, message: 'success', data }`。
 * 失败响应由 AllExceptionsFilter 负责，不走这里。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T | null>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T | null>> {
    return next.handle().pipe(
      map((data: T) => ({
        code: ErrorCode.SUCCESS,
        message: 'success',
        data: (data ?? null) as T | null,
      })),
    );
  }
}
