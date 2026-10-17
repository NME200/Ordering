import { request } from '../utils/request';

/**
 * 图片上传。
 *
 * 只负责「一张图换回一个地址」：菜品图与门店 logo 的字段本来就是存 URL 的，
 * 上传成功就是把返回的地址回填进同一个输入框，所以这两条路径共用一份字段与同一套校验，
 * 不需要为「本地图」另开一套数据形状。
 */
export interface UploadImageResult {
  /** 绝对地址，可直接给 el-image 与小程序 <image> 用 */
  url: string;
  /** 相对路径 */
  path: string;
  size: number;
}

/** 单张大小上限，与后端 `UPLOAD_MAX_MB` 同值：前端先挡一层只为立刻给话，后端才是准绳 */
export const UPLOAD_MAX_MB = 2;

/** 与后端 IMAGE_KINDS 一致；SVG 刻意不在内（能内嵌脚本，而上传目录公开可读） */
export const UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp';

export function uploadImage(file: File): Promise<UploadImageResult> {
  const form = new FormData();
  // 字段名必须是 file：后端按它取，传别的会被 multer 判成「没收到文件」
  form.append('file', file);
  return request<UploadImageResult>({
    url: '/uploads/image',
    method: 'post',
    data: form,
    // 图片比 JSON 请求慢，超时单独放宽，别用默认的 15 秒硬卡
    timeout: 60000,
  });
}
