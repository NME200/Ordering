/**
 * 应用配置聚合。
 *
 * 统一由 @nestjs/config 的 load 加载，业务代码一律通过 ConfigService
 * 以 `命名空间.字段` 读取（如 `config.get('database.host')`），
 * 禁止在源码中直接读 process.env（见 CODEBUDDY.md 5.5）。
 */

/** 去掉路由前缀的首尾斜杠，setGlobalPrefix 需要不带前导斜杠的路径 */
function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

export interface AppOptions {
  env: string;
  port: number;
  apiPrefix: string;
  isProduction: boolean;
  /**
   * 敏感配置（支付渠道私钥等）的主密钥，用于 AES-256-GCM 加解密。
   * 它本身不是支付配置，只是保护支付配置的那把钥匙；
   * 换掉它会让已入库的密文全部无法解密。
   */
  configSecret: string;
}

export interface DatabaseOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  poolSize: number;
}

export interface RedisOptions {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
}

export interface JwtOptions {
  secret: string;
  expiresIn: string;
}

export interface CorsOptions {
  enabled: boolean;
  /** 允许访问的来源白名单，禁止使用 * （见 CODEBUDDY.md 5.8） */
  origins: string[];
  credentials: boolean;
  maxAge: number;
}

export interface UploadOptions {
  /** 落盘根目录（相对路径按进程工作目录解析，即 ordering-serve/） */
  dir: string;
  /**
   * 拼图片绝对地址用的对外根：生产要填后台实际访问的域名
   * （如 https://admin.example.com），留空则按请求的 Host 与协议现拼。
   */
  publicBase: string;
  /** 单文件大小上限（字节） */
  maxBytes: number;
}

export interface AllConfig {
  app: AppOptions;
  database: DatabaseOptions;
  redis: RedisOptions;
  jwt: JwtOptions;
  cors: CorsOptions;
  upload: UploadOptions;
}

export default (): AllConfig => {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: Number(process.env.PORT ?? 3000),
      apiPrefix: normalizePrefix(process.env.API_PREFIX ?? '/api/v1'),
      isProduction: env === 'production',
      configSecret: process.env.CONFIG_SECRET_KEY ?? '',
    },
    database: {
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      username: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'Ordering-dev',
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      logging: process.env.DB_LOGGING === 'true',
      poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined,
      db: Number(process.env.REDIS_DB ?? 0),
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? '',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    },
    cors: {
      // 未显式配置时默认开启；白名单为空则拒绝所有跨域请求（失败关闭，而非放开）
      enabled: process.env.CORS_ENABLED !== 'false',
      origins: (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      credentials: process.env.CORS_CREDENTIALS === 'true',
      maxAge: Number(process.env.CORS_MAX_AGE ?? 86400),
    },
    upload: {
      dir: process.env.UPLOAD_DIR ?? 'uploads',
      publicBase: (process.env.UPLOAD_PUBLIC_BASE ?? '').replace(/\/+$/g, ''),
      maxBytes: Number(process.env.UPLOAD_MAX_MB ?? 2) * 1024 * 1024,
    },
  };
};
