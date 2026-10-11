import type { PaginatedData } from '@shared/types/api';
import { request } from '@shared/utils/request';
import type { InvoiceHandlePayload, InvoiceQuery, InvoiceRow } from '../types/invoice';

/** 开票申请列表（按状态 / 关键字筛选，租户范围由 Token 决定） */
export function fetchInvoices(params: InvoiceQuery): Promise<PaginatedData<InvoiceRow>> {
  return request<PaginatedData<InvoiceRow>>({ url: '/invoices', params });
}

/**
 * 受理开票申请。
 *
 * 服务端硬规则，前端必须先把住：置为 issued 必须带 invoiceNo、rejected 必须带 note；
 * 已开票不可回退（发票号一旦开出去就是对外凭据，红冲走线下）。
 */
export function handleInvoice(id: number, data: InvoiceHandlePayload): Promise<InvoiceRow> {
  return request<InvoiceRow>({ url: `/invoices/${id}/handle`, method: 'put', data });
}
