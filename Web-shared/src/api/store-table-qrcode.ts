import type { GenerateAllQrcodesResult, TableQrcode, TableQrcodeImage } from '../types/store';
import { request } from '../utils/request';

/**
 * 门店桌码接口（商家自己后台）。
 *
 * 门店 ID 一律走路径：出码只能给自己的门店，越权由服务端的门店范围校验挡掉。
 * 凭据是平台那一份（系统设置 → 小程序配置），没配齐时这些接口会如实回错误。
 */

/** 本店已生成的桌码（列表不含图片） */
export function fetchTableQrcodes(storeId: number): Promise<TableQrcode[]> {
  return request<TableQrcode[]>({ url: `/stores/${storeId}/table-qrcodes` });
}

/** 生成（或覆盖重生成）单张桌码，返回带图片的那一行 */
export function generateTableQrcode(
  storeId: number,
  tableNo: string,
): Promise<TableQrcodeImage> {
  return request<TableQrcodeImage>({
    url: `/stores/${storeId}/table-qrcodes/generate`,
    method: 'post',
    data: { tableNo },
  });
}

/** 批量生成本店所有启用中的台位码 */
export function generateAllTableQrcodes(
  storeId: number,
): Promise<GenerateAllQrcodesResult> {
  return request<GenerateAllQrcodesResult>({
    url: `/stores/${storeId}/table-qrcodes/generate-all`,
    method: 'post',
  });
}
