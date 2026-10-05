import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 请求日志拦截器。
 *
 * 只记录「方法 + 路径 + 耗时 + 结果」，**不记录请求体**，
 * 避免密码等敏感信息落盘。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${originalUrl} ${Date.now() - startedAt}ms`);
        },
        error: (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(`${method} ${originalUrl} ${Date.now() - startedAt}ms - ${reason}`);
        },
      }),
    );
  }
}
