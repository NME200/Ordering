import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * 数据库模块：按 CODEBUDDY.md 5.7 用 forRootAsync 读取环境变量建立连接，
 * 禁止硬编码连接信息。
 *
 * - `autoLoadEntities: true`：各业务模块用 forFeature 注册的实体会自动生效；
 * - `synchronize` 由 DB_SYNCHRONIZE 控制，**生产环境必须为 false**。
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const synchronize = config.get<boolean>('database.synchronize') ?? false;
        const env = config.get<string>('app.env') ?? 'development';

        if (synchronize && env === 'production') {
          throw new Error('生产环境禁止开启 DB_SYNCHRONIZE，请改用 migration 管理表结构');
        }

        return {
          type: 'mysql',
          host: config.getOrThrow<string>('database.host'),
          port: config.getOrThrow<number>('database.port'),
          username: config.getOrThrow<string>('database.username'),
          password: config.getOrThrow<string>('database.password'),
          database: config.getOrThrow<string>('database.database'),
          charset: 'utf8mb4',
          timezone: '+08:00',
          synchronize,
          logging: config.get<boolean>('database.logging') ?? false,
          autoLoadEntities: true,
          extra: {
            connectionLimit: config.get<number>('database.poolSize') ?? 10,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {
  constructor(private readonly config: ConfigService) {
    Logger.log(
      `数据库已连接：${this.config.getOrThrow<string>('database.database')}@${this.config.getOrThrow<string>('database.host')}:${this.config.getOrThrow<number>('database.port')}`,
      'DatabaseModule',
    );
  }
}
