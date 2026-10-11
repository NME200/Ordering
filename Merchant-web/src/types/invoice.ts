import type { PaginationQuery } from '@shared/types/api';

/**
 * 开票申请 —— 与后端 `modules/invoice` 的出入参对齐。
 *
 * 本轮**没有接开票服务商**：顾客提交后落到商户，由商户线下开好电子发票再回填发票号，
 * 所以界面文案必须说「线下开好电子票后回填发票号」，不能写成「系统将自动开票」。
 */

/** 抬头类型 */
export type InvoiceTitleKind = 'personal' | 'enterprise';

export const INVOICE_TITLE_KIND_LABELS: Record<InvoiceTitleKind, string> = {
  personal: '个人',
  enterprise: '企业',
};

/** 申请状态 */
export type InvoiceStatus = 'pending' | 'issuing' | 'issued' | 'rejected';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: '待开票',
  issuing: '开票中',
  issued: '已开票',
  rejected: '已驳回',
};

export const INVOICE_STATUS_OPTIONS: { label: string; value: InvoiceStatus }[] = [
  { label: '待开票', value: 'pending' },
  { label: '开票中', value: 'issuing' },
  { label: '已开票', value: 'issued' },
  { label: '已驳回', value: 'rejected' },
];

export const INVOICE_STATUS_TAG_TYPES: Record<
  InvoiceStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  pending: 'warning',
  issuing: 'primary',
  issued: 'success',
  rejected: 'danger',
};

/** 开票申请行（后端 InvoiceDto） */
export interface InvoiceRow {
  id: number;
  orderId: number;
  orderNo: string;
  /** 开票金额（分）= 订单实付 */
  amount: number;
  kind: InvoiceTitleKind;
  title: string;
  taxNo: string | null;
  email: string;
  status: InvoiceStatus;
  statusLabel: string;
  invoiceNo: string | null;
  invoiceUrl: string | null;
  /** 顾客填的备注 */
  remark: string | null;
  /** 商户填的处理说明；驳回时是驳回原因 */
  handleNote: string | null;
  createdAt: string;
  handledAt: string | null;
  storeId?: number;
  customerId?: number;
}

/** 列表查询：merchantId 由 Token 决定，商户侧一律不传 */
export interface InvoiceQuery extends PaginationQuery {
  status?: InvoiceStatus;
  /** 订单号 / 抬头关键字 */
  keyword?: string;
}

/** 受理动作：后端只接受这三个目标状态 */
export type InvoiceHandleStatus = Exclude<InvoiceStatus, 'pending'>;

/** 受理入参：置为 issued 必须带 invoiceNo；置为 rejected 必须带 note */
export interface InvoiceHandlePayload {
  status: InvoiceHandleStatus;
  invoiceNo?: string;
  invoiceUrl?: string;
  note?: string;
}
