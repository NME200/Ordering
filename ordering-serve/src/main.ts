import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * 应用入口。
 *
 * 全局管道 / CORS / Swagger 在此注册；守卫 / 拦截器 / 过滤器统一在 AppModule
 * 中注册，以便参与依赖注入。
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // rawBody: true —— 支付回调验签必须使用原始请求体，不能被 JSON 重新序列化
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  /**
   * 反向代理后信任一跳，`req.ip` 才是顾客真实 IP。
   *
   * 不设的话限流与日志里所有顾客会共用同一个 IP（生产是 1Panel / OpenResty 反代），
   * 匿名接口几分钟就会被集体打死。若代理链更长（多层 CDN）需要相应调大这里的跳数。
   */
  app.set('trust proxy', 1);

  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  const port = configService.getOrThrow<number>('app.port');
  const env = configService.getOrThrow<string>('app.env');

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      // 剔除 DTO 未声明的字段，防止脏参数透传到业务层
      whitelist: true,
      // 自动按 DTO 类型转换（配合 @Type() 使用）
      transform: true,
    }),
  );

  // CORS 白名单：来源必须来自环境变量，禁止使用通配符（见 CODEBUDDY.md 5.8）
  const corsEnabled = configService.get<boolean>('cors.enabled') ?? true;
  const corsOrigins = configService.get<string[]>('cors.origins') ?? [];
  if (corsEnabled) {
    if (corsOrigins.length === 0) {
      logger.warn('CORS 已启用但 CORS_ORIGINS 白名单为空，所有跨域请求都会被拒绝');
    }
    app.enableCors({
      origin: corsOrigins,
      credentials: configService.get<boolean>('cors.credentials') ?? false,
      maxAge: configService.get<number>('cors.maxAge') ?? 86400,
    });
    logger.log(`CORS 白名单：${corsOrigins.length > 0 ? corsOrigins.join(', ') : '（空）'}`);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ordering 点餐系统 API')
    .setDescription('多商户 SaaS 点餐系统 —— 后端接口文档')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`运行环境：${env}`);
  logger.log(`服务地址：http://localhost:${port}/${apiPrefix}`);
  logger.log(`接口文档：http://localhost:${port}/api/docs`);
}

void bootstrap();
