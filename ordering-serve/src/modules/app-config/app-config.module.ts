import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig } from './entities/app-config.entity';

/**
 * 小程序布局配置模块。
 *
 * 导出 AppConfigService 给 C 端公开接口用（`GET /public/app-config`），
 * 本模块自己的控制器只对平台管理员开放。
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppConfig])],
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
