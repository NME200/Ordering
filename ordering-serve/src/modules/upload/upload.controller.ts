import { BadRequestException, Controller, HttpCode, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../shared/enums/permission.enum';
import { UploadService, type UploadFile } from './upload.service';

/**
 * 框架层的字节兜底。
 *
 * multer 的 limits 在装饰器求值时就得定死，拿不到 DI 里的配置，所以这里给一个固定的宽上限，
 * 只为别让超大文件被打进内存；真正该提示给用户的上限是 `UPLOAD_MAX_MB`，在 UploadService 里判。
 */
const HARD_LIMIT_BYTES = 8 * 1024 * 1024;

/** 上传结果出参 */
export class UploadImageResponseDto {
  @ApiProperty({
    description: '可直接使用的绝对图片地址，填进 dishes.image_url / stores.logo',
    example: 'http://localhost:3100/api/v1/uploads/2026-10/2f1c9e0a-1b2c-4d5e-8f90-a1b2c3d4e5f6.png',
  })
  url!: string;

  @ApiProperty({ description: '相对路径（将来换域名时还能用）' })
  path!: string;

  @ApiProperty({ description: '落盘字节数' })
  size!: number;
}

/**
 * 图片上传（后台侧，需登录 + 经营类写权限）。
 *
 * 谁能传：能改菜品或能改门店的人。平台管理员有 `store:create`，所以平台端的「新增门店」
 * 里同样能传；商户后台的嵌入只读形态不会调这个接口。
 * 刻意**不是公开接口** —— 公开上传等于让匿名者往自家域名下塞文件。
 */
@ApiTags('图片上传')
@ApiBearerAuth()
@Controller('uploads')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly config: ConfigService,
  ) {}

  @Post('image')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      // 不指定 storage 就是 multer 的内存存储：先进内存、确认过文件头才落盘，
      // 改名的 .html / .svg 根本没机会进那个公开可读的目录。
      // 也不为此引入 @types/multer —— multer 没自带类型声明，用它的默认值就够。
      limits: { fileSize: HARD_LIMIT_BYTES, files: 1 },
    }),
  )
  @Permissions(
    Permission.DISH_CREATE,
    Permission.DISH_UPDATE,
    Permission.STORE_CREATE,
    Permission.STORE_UPDATE,
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary', description: 'JPG / PNG / GIF / WebP' } },
    },
  })
  @ApiOperation({
    summary: '上传一张图片',
    description:
      '按 UTC 年月落到 uploads 目录，文件名由服务端生成（原始文件名一个字符都不采用）。' +
      '类型**按文件头判**，把 .html 改名成 .jpg 没用；SVG 刻意不支持 —— 它能内嵌脚本，' +
      '而这个目录是挂在自家域名下公开可读的。',
  })
  uploadImage(
    @UploadedFile() file: UploadFile | undefined,
    @Req() request: Request,
  ): Promise<UploadImageResponseDto> {
    if (!file) {
      throw new BadRequestException('没有收到文件：表单字段名必须是 file');
    }
    const prefix = `/${this.config.getOrThrow<string>('app.apiPrefix')}/uploads`;
    return this.uploadService.saveImage(file, request, prefix);
  }
}
