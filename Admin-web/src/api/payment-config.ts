import { request } from '@shared/utils/request';
import type {
  ChannelSchema,
  PaymentConfigInfo,
  SavePaymentConfigPayload,
} from '../types/payment-config';

/** 支付配置接口（平台专有） */

/** 全渠道配置：敏感字段只返回「是否已配置」 */
export function fetchPaymentConfigs(): Promise<PaymentConfigInfo[]> {
  return request<PaymentConfigInfo[]>({ url: '/payment-configs' });
}

/** 各渠道的表单字段定义，界面据此动态渲染 */
export function fetchPaymentConfigSchema(): Promise<ChannelSchema[]> {
  return request<ChannelSchema[]>({ url: '/payment-configs/schema' });
}

/** 保存指定渠道的配置；敏感字段传空串表示保持原值 */
export function savePaymentConfig(
  channel: string,
  data: SavePaymentConfigPayload,
): Promise<PaymentConfigInfo> {
  return request<PaymentConfigInfo>({
    url: `/payment-configs/${channel}`,
    method: 'put',
    data,
  });
}

/** 启用 / 停用指定渠道（0 停用 / 1 启用） */
export function setPaymentConfigEnabled(
  channel: string,
  enabled: number,
): Promise<PaymentConfigInfo> {
  return request<PaymentConfigInfo>({
    url: `/payment-configs/${channel}/enabled`,
    method: 'put',
    data: { enabled },
  });
}
