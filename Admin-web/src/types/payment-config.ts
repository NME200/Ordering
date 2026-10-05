import type { CommonStatus, PaymentChannel } from '@shared/types/enums';

/**
 * 支付配置相关类型。
 *
 * 放在 Admin-web 而不是 Web-shared：支付凭据是**平台专有**能力，
 * 商户端与收银端既不该看到、也不该能调用这些接口。
 * 字段定义与后端 `payment-config/constants/channel-fields.ts` 一一对应。
 */

/** 表单控件类型 */
export type ChannelFieldType = 'text' | 'textarea' | 'select';

export interface ChannelFieldOption {
  value: string;
  label: string;
}

/** 服务端下发的字段定义 —— 界面按它动态渲染表单，不在前端硬编码字段清单 */
export interface ChannelField {
  key: string;
  label: string;
  type: ChannelFieldType;
  required: boolean;
  /** 敏感字段：响应只有「是否已配置」，提交时留空表示不修改 */
  secret: boolean;
  /** 条件必填：同渠道内另一个字段等于指定值时才必填 */
  requiredWhen?: { field: string; equals: string };
  options?: ChannelFieldOption[];
  defaultValue?: string;
  placeholder?: string;
  help?: string;
  pattern?: string;
  patternMessage?: string;
  maxLength?: number;
}

/** 单个渠道的表单结构 */
export interface ChannelSchema {
  channel: PaymentChannel;
  channelLabel: string;
  fields: ChannelField[];
}

export interface SecretFieldState {
  configured: boolean;
}

/** 某个渠道的当前配置（敏感字段仅为状态，绝不含原文） */
export interface PaymentConfigInfo {
  channel: PaymentChannel;
  channelLabel: string;
  online: boolean;
  /** 服务端是否已接入真实实现；false 时配置可保存但不会挂载 */
  implemented: boolean;
  description: string;
  enabled: CommonStatus;
  values: Record<string, string>;
  secrets: Record<string, SecretFieldState>;
  complete: boolean;
  missingLabels: string[];
  remark: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface SavePaymentConfigPayload {
  settings: Record<string, string>;
  remark?: string;
}
