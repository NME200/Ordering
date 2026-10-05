import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** 运行环境取值 */
export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * 环境变量结构定义。
 * 启动时校验，**缺少关键变量直接启动失败**，避免运行到一半才报错。
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv, { message: 'NODE_ENV 只能是 development / production / test' })
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt({ message: 'PORT 必须为整数' })
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty({ message: 'API_PREFIX 不能为空' })
  API_PREFIX: string = '/api/v1';

  @IsString()
  @IsNotEmpty({ message: 'DB_HOST 不能为空' })
  DB_HOST!: string;

  @IsInt({ message: 'DB_PORT 必须为整数' })
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  @IsNotEmpty({ message: 'DB_USER 不能为空' })
  DB_USER!: string;

  @IsString({ message: 'DB_PASSWORD 必须为字符串（无密码时留空）' })
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty({ message: 'DB_NAME 不能为空' })
  DB_NAME!: string;

  @IsOptional()
  @IsString()
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsString()
  DB_LOGGING?: string;

  @IsOptional()
  @IsInt()
  DB_POOL_SIZE?: number;

  @IsString()
  @IsNotEmpty({ message: 'REDIS_HOST 不能为空' })
  REDIS_HOST!: string;

  @IsInt({ message: 'REDIS_PORT 必须为整数' })
  @Min(1)
  @Max(65535)
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsInt()
  REDIS_DB?: number;

  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET 不能为空' })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_EXPIRES_IN 不能为空' })
  JWT_EXPIRES_IN!: string;

  @IsOptional()
  @IsString()
  CORS_ENABLED?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  CORS_CREDENTIALS?: string;

  @IsOptional()
  @IsInt({ message: 'CORS_MAX_AGE 必须为整数' })
  CORS_MAX_AGE?: number;

  /**
   * 敏感配置主密钥：用于加解密入库的支付渠道私钥。
   * **必填**——缺失就让启动失败，不能等到运营在界面上填支付配置时
   * 才发现无处可存（失败关闭）。
   * 换掉它会导致已入库的密文全部无法解密，必须连同支付配置一起重填。
   */
  @IsString({ message: 'CONFIG_SECRET_KEY 必须为字符串' })
  @IsNotEmpty({ message: 'CONFIG_SECRET_KEY 不能为空' })
  @MinLength(16, { message: 'CONFIG_SECRET_KEY 至少 16 个字符' })
  CONFIG_SECRET_KEY!: string;
}

/**
 * 校验环境变量。
 *
 * 校验通过后返回原始 config（不做结构转换，结构转换由 configuration.ts 负责），
 * 校验失败则抛出异常，让应用在启动阶段就失败。
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map((error) => {
        const messages = Object.values(error.constraints ?? {}).join('、');
        return `${error.property}（${messages}）`;
      })
      .join('；');
    throw new Error(`环境变量校验失败：${detail}`);
  }

  return config;
}
