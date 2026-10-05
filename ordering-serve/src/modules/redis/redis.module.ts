import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { SerialNoGenerator } from './serial-no.generator';

/**
 * Redis 模块（全局）。
 *
 * 用途：会话 / 缓存 / 分布式锁 / 队列（见 CODEBUDDY.md 二、技术栈总览）。
 * 当前承担：登录失败计数、Token 黑名单、单号日序列。
 * 同时导出 Redis 支撑的 SerialNoGenerator，供各业务模块直接注入。
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const password = config.get<string>('redis.password');

        const client = new Redis({
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
          password: password && password.length > 0 ? password : undefined,
          db: config.get<number>('redis.db') ?? 0,
        });

        client.on('connect', () => logger.log('Redis 连接成功'));
        client.on('error', (error: Error) => logger.error(`Redis 连接异常：${error.message}`));

        return client;
      },
    },
    SerialNoGenerator,
  ],
  exports: [REDIS_CLIENT, SerialNoGenerator],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** 应用关闭时释放连接，避免进程无法正常退出 */
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
