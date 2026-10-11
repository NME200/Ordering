import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiniappConfig } from './entities/miniapp-config.entity';
import { MiniappConfigService } from './miniapp-config.service';
import { MiniappController } from './miniapp.controller';
import { WechatMiniappClient } from './wechat-miniapp.client';

/**
 * 小程序凭据模块（平台级，全平台一份）。
 *
 * 不依赖任何租户侧模块 —— 依赖方向永远是「要用微信接口的人 import 这儿」：
 * store 出桌码、customer 做微信登录与手机号绑定，反过来会让「凭据」认识「门店」，成环。
 */
@Module({
  imports: [TypeOrmModule.forFeature([MiniappConfig])],
  controllers: [MiniappController],
  providers: [MiniappConfigService, WechatMiniappClient],
  exports: [MiniappConfigService, WechatMiniappClient],
})
export class MiniappModule {}
