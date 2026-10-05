/** Redis 客户端注入令牌 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Redis key 统一前缀，避免多环境 / 多应用共用同一实例时互相覆盖 */
export const REDIS_KEY_PREFIX = 'ordering';

/** 认证相关 Redis key 生成器 */
export const RedisKeys = {
  /** 登录失败次数：key 粒度到「用户名」 */
  loginFailCount: (username: string) => `${REDIS_KEY_PREFIX}:auth:login:fail:${username}`,
  /** Token 黑名单：登出 / 改密后使旧 Token 立即失效 */
  tokenBlacklist: (jti: string) => `${REDIS_KEY_PREFIX}:auth:token:blacklist:${jti}`,
  /** 单号日序列：按「业务前缀 + 日期」自增，保证单号唯一且递增 */
  serialSeq: (prefix: string, ymd: string) =>
    `${REDIS_KEY_PREFIX}:serial:${prefix.toLowerCase()}:${ymd}`,
  /**
   * 匿名接口限流计数：按「接口桶 + 客户端 IP + 窗口序号」。
   * 窗口序号进键名，所以旧窗口的键靠 TTL 自然淘汰，不需要清理任务。
   */
  rateLimit: (bucket: string, ip: string, windowIndex: number) =>
    `${REDIS_KEY_PREFIX}:ratelimit:${bucket}:${ip}:${windowIndex}`,
};

/** 租户可用性相关 Redis key 生成器 */
export const TenantKeys = {
  /**
   * 商户可用状态短缓存（status / expireAt）。
   * 每次请求都要判断「这个租户还准不准营业」，不打库就靠它；
   * 商户被平台改动时由 MerchantService 主动失效。
   */
  merchantState: (merchantId: number) => `${REDIS_KEY_PREFIX}:tenant:merchant:${merchantId}`,
};
