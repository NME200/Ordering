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
  /**
   * 顾客手机验证码。
   *
   * 键里带手机号，所以同一号码重复申请会覆盖旧码 —— 这是想要的行为：
   * 老验证码立即失效，避免被人拿历史码撞。
   */
  smsCode: (phone: string) => `${REDIS_KEY_PREFIX}:sms:code:${phone}`,
  /** 验证码发送间隔锁：存在即拒绝再次发送 */
  smsInterval: (phone: string) => `${REDIS_KEY_PREFIX}:sms:interval:${phone}`,
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
