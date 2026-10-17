import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../shared/enums/error-code.enum';

/** 内存里暂存的上传文件（multer memoryStorage 的形状） */
export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * 允许的图片来源：**以文件头为准**，扩展名与 MIME 只是第二道说明。
 *
 * 每个都带 magic bytes —— 上传目录是被静态服务直接对外暴露的，
 * 一个改名成 .jpg 的 .html / .svg 脚本如果真落了盘，就等于在自家域名下托管别人的页面。
 * 尤其 SVG 可以直接内嵌脚本，所以刻意不在白名单里。
 */
const IMAGE_KINDS: { ext: string; mime: string; magic: number[] }[] = [
  { ext: 'jpg', mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'gif', mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  // RIFF....WEBP：前 4 字节固定，8~11 字节必须是 WEBP
  { ext: 'webp', mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },
];

/** 上传文件与访问地址 */
export interface UploadResult {
  url: string;
  /** 相对路径，存库也够用（换域名时不至于全是旧地址） */
  path: string;
  size: number;
}

/**
 * 图片落盘服务。
 *
 * 只做一件事：把一张**确认过是图片**的字节流安全地放进 uploads 目录，
 * 并给出一个能直接塞进 `dishes.image_url` / `stores.logo` 的地址。
 *
 * 三条刻意的选择：
 * 1. **文件名由服务端生成**（UUID + 真实扩展名），原始文件名一个字符都不用 ——
 *    它既可能带 `../`，也可能带 `.php`，而这目录是挂在公开 URL 下的。
 * 2. **按年月分目录**，目录要人工清理/备份时能按月整块搬走。
 * 3. **地址是绝对 URL**。小程序的 `<image>` 与后台的 `<el-image>` 都按绝对地址用，
 *    存相对路径的话，顾客端从 `env.ts` 拿到的基址和后台不同源就会挂图。
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly config: ConfigService) {}

  get maxBytes(): number {
    return this.config.getOrThrow<number>('upload.maxBytes');
  }

  private get rootDir(): string {
    return this.config.getOrThrow<string>('upload.dir');
  }

  /**
   * 校验并落盘。
   *
   * @param prefix 静态托管前缀（如 `/api/v1/uploads`），拼绝对地址用
   */
  async saveImage(file: UploadFile | undefined, request: Request, prefix: string): Promise<UploadResult> {
    if (!file?.buffer?.length) {
      throw BusinessException.badRequest(
        ErrorCode.UPLOAD_FILE_REQUIRED,
        '没有收到文件：表单字段名必须是 file',
      );
    }
    if (file.size > this.maxBytes) {
      throw BusinessException.badRequest(
        ErrorCode.UPLOAD_FILE_TOO_LARGE,
        `图片不能超过 ${Math.round(this.maxBytes / 1024 / 1024)}MB`,
      );
    }

    const kind = this.detectKind(file);
    const month = this.monthFolder();
    const fileName = `${randomUUID()}.${kind.ext}`;
    const absoluteDir = join(process.cwd(), this.rootDir, month);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(join(absoluteDir, fileName), file.buffer);

    const url = `${this.baseOf(request)}${prefix}/${month}/${fileName}`;
    this.logger.log(`已保存上传图片 ${url}（${(file.size / 1024).toFixed(0)}KB）`);
    return { url, path: `${prefix}/${month}/${fileName}`, size: file.size };
  }

  /**
   * 认文件头而不是认扩展名。
   *
   * WebP 特殊：RIFF 头只说明它是「一条 RIFF 容器」，必须再确认第 8~11 字节是 WEBP，
   * 否则一个 WAV/AVI 也能骗过前 4 字节。
   */
  private detectKind(file: UploadFile): { ext: string; mime: string } {
    for (const kind of IMAGE_KINDS) {
      const matched = kind.magic.every((byte, index) => file.buffer[index] === byte);
      if (!matched) {
        continue;
      }
      if (kind.ext === 'webp') {
        const webp = String.fromCharCode(...file.buffer.subarray(8, 12));
        if (webp !== 'WEBP') {
          continue;
        }
      }
      return { ext: kind.ext, mime: kind.mime };
    }
    throw BusinessException.badRequest(
      ErrorCode.UPLOAD_FILE_TYPE_INVALID,
      '只支持 JPG / PNG / GIF / WebP 图片（会按文件头判断，改后缀没用）',
    );
  }

  /** 上传目录内用 UTC 年月分文件夹，跨月的文件好找也好清 */
  private monthFolder(): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${now.getUTCFullYear()}-${month}`;
  }

  /**
   * 拼图片地址用的对外根。
   *
   * 优先用 `UPLOAD_PUBLIC_BASE`（生产推荐显式配好，免得反代头没传全时拼出内网地址）；
   * 没配就按当前请求现推：`trust proxy` 已开，所以 `x-forwarded-proto` 能被 Express 认下来，
   * 反代后面也能拿到真实的 https 与域名。
   */
  private baseOf(request: Request): string {
    const configured = this.config.get<string>('upload.publicBase');
    if (configured) {
      return configured;
    }
    const protocol = request.secure ? 'https' : request.protocol;
    return `${protocol}://${request.get('host') ?? `localhost:${this.config.get('app.port')}`}`;
  }
}
