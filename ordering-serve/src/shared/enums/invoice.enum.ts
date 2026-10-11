/**
 * 发票枚举（14.x 发票域）。
 *
 * 本轮**不接任何税务/开票服务商**：申请落到商户，由商户线下开电子发票后回填发票号。
 * 因此状态机里必须保留 ISSUING（开票中）这个人工环节，
 * 不能让顾客提交完就直接看到「已开票」。
 */

export enum InvoiceTitleKind {
  /** 个人抬头 */
  PERSONAL = 'personal',
  /** 企业抬头（必须带税号） */
  ENTERPRISE = 'enterprise',
}

export const INVOICE_TITLE_KIND_VALUES: InvoiceTitleKind[] = [
  InvoiceTitleKind.PERSONAL,
  InvoiceTitleKind.ENTERPRISE,
];

export const INVOICE_TITLE_KIND_LABELS: Record<InvoiceTitleKind, string> = {
  [InvoiceTitleKind.PERSONAL]: '个人',
  [InvoiceTitleKind.ENTERPRISE]: '企业',
};

export enum InvoiceStatus {
  /** 待开票：顾客已提交，商户还没处理 */
  PENDING = 'pending',
  /** 开票中：商户已受理 */
  ISSUING = 'issuing',
  /** 已开票：发票号已回填 */
  ISSUED = 'issued',
  /** 已驳回：金额或抬头不合规 */
  REJECTED = 'rejected',
}

export const INVOICE_STATUS_VALUES: InvoiceStatus[] = [
  InvoiceStatus.PENDING,
  InvoiceStatus.ISSUING,
  InvoiceStatus.ISSUED,
  InvoiceStatus.REJECTED,
];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.PENDING]: '待开票',
  [InvoiceStatus.ISSUING]: '开票中',
  [InvoiceStatus.ISSUED]: '已开票',
  [InvoiceStatus.REJECTED]: '已驳回',
};

/** 「我的」页三个页签：可开票 / 开票中 / 已开票（设计稿 §三.16） */
export const INVOICE_TABS = ['available', 'processing', 'issued'] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

export const INVOICE_TAB_LABELS: Record<InvoiceTab, string> = {
  available: '可开票',
  processing: '开票中',
  issued: '已开票',
};

/** 订单完成后可开票窗口（天）。超过就不允许申请，避免翻出半年前的单开票 */
export const INVOICE_APPLY_WINDOW_DAYS = 30;
