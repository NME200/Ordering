/**
 * 展示层打码工具。
 *
 * 打码发生在**服务端出参**，不是前端拿到完整号码再遮：
 * 只要完整号码进了响应体，抓包就能拿到，顾客列表页的「手机」列就成了批量导出渠道。
 */

/** 手机号打码：138****8888；长度不足 7 位时整串打码，不猜格式 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  if (phone.length < 7) {
    return '****';
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
