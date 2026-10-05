import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import Redis from 'ioredis';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { REDIS_CLIENT, RedisKeys } from '../../modules/redis/redis.constants';
import { BusinessException } from '../exceptions/business.exception';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

/**
 * 匿名接口限流守卫（固定窗口计数）。
 *
 * 只对标了 `@RateLimit()` 的接口生效，其余直接放行。
 * 计数失败时**放行而不是拒绝** —— 限流器不该变成可用性单点：
 * Redis 抖一下就让所有顾客看不了菜单，比被刷一次严重得多。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.clientIp(request);
    const windowIndex = Math.floor(Date.now() / (rule.windowSeconds * 1000));
    const key = RedisKeys.rateLimit(rule.bucket, ip, windowIndex);

    let count: number;
    try {
      count = await this.redis.incr(key);
      // 只有首次命中才设 TTL，否则窗口会被持续请求无限续期
      if (count === 1) {
        await this.redis.expire(key, rule.windowSeconds);
      }
    } catch (error) {
      this.logger.warn(`限流计数失败，本次放行：${(error as Error).message}`);
      return true;
    }

    if (count > rule.limit) {
      const retryAfter = rule.windowSeconds - Math.floor((Date.now() / 1000) % rule.windowSeconds);
      throw new BusinessException(
        ErrorCode.TOO_MANY_REQUESTS,
        `访问过于频繁，请 ${retryAfter} 秒后再试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * 客户端 IP。
   *
   * 依赖 `main.ts` 里的 `trust proxy`：不设的话在反向代理后面拿到的永远是代理 IP，
   * 全店顾客会共用同一个限流桶，几分钟就把菜单接口打死。
   */
  private clientIp(request: Request): string {
    return (request.ip ?? 'unknown').replace(/^::ffff:/, '') || 'unknown';
  }
}
