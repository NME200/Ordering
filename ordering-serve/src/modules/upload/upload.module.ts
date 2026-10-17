import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * 图片上传模块。
 *
 * 没有业务实体的依赖，只负责「字节 → 磁盘 → 一个能用的地址」。
 * 静态托管在 `main.ts` 里挂（`/api/v1/uploads/`），因为它属于框架层的路由挂载，
 * 而不是某个 Service 的能力；上传目录因此与接口同源，生产不需要再动 nginx。
 */
@Module({
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
