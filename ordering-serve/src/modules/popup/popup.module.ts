import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PopupController } from './popup.controller';
import { PopupService } from './popup.service';
import { PopupConfig } from './entities/popup-config.entity';
import { PopupShowLog } from './entities/popup-show-log.entity';

/**
 * 活动弹窗模块。
 *
 * 导出 PopupService 给 C 端公开接口用（`/public/popup/*`），
 * 本模块自己的控制器只对平台管理员开放。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PopupConfig, PopupShowLog])],
  controllers: [PopupController],
  providers: [PopupService],
  exports: [PopupService],
})
export class PopupModule {}
