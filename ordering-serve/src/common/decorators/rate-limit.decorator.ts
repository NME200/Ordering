import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'auth:rateLimit';

/** 限流规则：某个桶内、某个时间窗里最多多少次 */
export interface RateLimitOptions {
  /** 分桶名，决定 Redis 键的前缀（不同接口互不影响） */
  bucket: string;
  /** 窗口内允许的请求数 */
  limit: number;
  /** 窗口长度（秒） */
  windowSeconds: number;
}

/**
 * 给接口挂匿名流量限流。
 *
 * 只声明在**没有登录态**的公开接口上：登录接口有按用户名的 Redis 锁定，
 * 后台接口有 Token 可追溯，都不需要这一层。
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
