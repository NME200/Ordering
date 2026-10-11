/**
 * 在线客服枚举（15.x 客服域）。
 *
 * 会话按「顾客 × 商户」一条，顾客侧轮询拉新消息，商户侧回复。
 * 没上 WebSocket：小程序侧要额外的长连接鉴权与心跳，本轮用轮询够用且不会静默丢消息。
 */

export enum ServiceSender {
  CUSTOMER = 'customer',
  STAFF = 'staff',
}

export const SERVICE_SENDER_VALUES: ServiceSender[] = [ServiceSender.CUSTOMER, ServiceSender.STAFF];

export const SERVICE_SENDER_LABELS: Record<ServiceSender, string> = {
  [ServiceSender.CUSTOMER]: '顾客',
  [ServiceSender.STAFF]: '客服',
};

export enum ServiceSessionStatus {
  /** 待客服回复 */
  OPEN = 'open',
  /** 客服已回复，等顾客看 */
  REPLIED = 'replied',
  /** 已关闭 */
  CLOSED = 'closed',
}

export const SERVICE_SESSION_STATUS_LABELS: Record<ServiceSessionStatus, string> = {
  [ServiceSessionStatus.OPEN]: '待回复',
  [ServiceSessionStatus.REPLIED]: '已回复',
  [ServiceSessionStatus.CLOSED]: '已结束',
};

/** 单条消息长度上限，与 service_messages.content 列一致 */
export const SERVICE_MESSAGE_MAX_LENGTH = 500;
