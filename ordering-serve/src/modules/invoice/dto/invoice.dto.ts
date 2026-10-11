import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  INVOICE_STATUS_VALUES,
  INVOICE_TABS,
  INVOICE_TITLE_KIND_VALUES,
  InvoiceStatus,
  InvoiceTab,
  InvoiceTitleKind,
} from '../../../shared/enums/invoice.enum';

/** 企业税号：15 / 18 / 20 位数字或大写字母 */
const TAX_NO_PATTERN = /^[0-9A-Z]{15}$|^[0-9A-Z]{18}$|^[0-9A-Z]{20}$/;

/** 新增 / 修改发票抬头 */
export class UpsertInvoiceTitleDto {
  @ApiProperty({ description: '抬头类型：personal / enterprise', enum: InvoiceTitleKind })
  @IsIn(INVOICE_TITLE_KIND_VALUES, { message: 'kind 只能是 personal 或 enterprise' })
  kind!: InvoiceTitleKind;

  @ApiProperty({ description: '抬头名称', maxLength: 64 })
  @IsString()
  @MaxLength(64, { message: '抬头名称最长 64 个字符' })
  title!: string;

  @ApiPropertyOptional({ description: '纳税人识别号，企业抬头必填' })
  @IsOptional()
  @Matches(TAX_NO_PATTERN, { message: '税号应为 15 / 18 / 20 位数字或大写字母' })
  taxNo?: string;

  @ApiProperty({ description: '接收电子发票的邮箱' })
  @IsString()
  @Matches(/^[\w.+-]+@[\w-]+\.[\w.-]+$/, { message: '邮箱格式不正确' })
  email!: string;

  @ApiPropertyOptional({ description: '是否设为默认抬头' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: 'isDefault 只能是 0 或 1' })
  isDefault?: number;
}

/** 提交开票申请 */
export class CreateInvoiceDto {
  @ApiProperty({ description: '订单 ID（必须本人已完成、30 天内且未开过票）' })
  @Type(() => Number)
  @IsInt({ message: 'orderId 必须为整数' })
  @Min(1, { message: 'orderId 最小为 1' })
  orderId!: number;

  @ApiProperty({ description: '使用的抬头 ID' })
  @Type(() => Number)
  @IsInt({ message: 'titleId 必须为整数' })
  @Min(1, { message: 'titleId 最小为 1' })
  titleId!: number;

  @ApiPropertyOptional({ description: '开票内容说明', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;
}

/** 商户受理开票 */
export class HandleInvoiceDto {
  @ApiProperty({
    description: '目标状态：issuing 受理 / issued 已开票（需发票号）/ rejected 驳回',
    enum: InvoiceStatus,
  })
  @IsIn(INVOICE_STATUS_VALUES.filter((item) => item !== InvoiceStatus.PENDING), {
    message: 'status 只能是 issuing / issued / rejected',
  })
  status!: InvoiceStatus;

  @ApiPropertyOptional({ description: '发票号，置为已开票时必填', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '发票号最长 64 个字符' })
  invoiceNo?: string;

  @ApiPropertyOptional({ description: '电子发票下载地址', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '发票地址最长 255 个字符' })
  invoiceUrl?: string;

  @ApiPropertyOptional({ description: '处理说明；驳回时必须写原因', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '说明最长 255 个字符' })
  note?: string;
}

/** 商户侧列表查询 */
export class QueryInvoiceDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '商户 ID（平台侧）' })
  @IsOptional()
  @Type(() => Number)
  merchantId?: number;

  @ApiPropertyOptional({ description: '状态筛选', enum: InvoiceStatus })
  @IsOptional()
  @IsIn(INVOICE_STATUS_VALUES, { message: 'status 取值不合法' })
  status?: InvoiceStatus;

  @ApiPropertyOptional({ description: '订单号 / 抬头关键字' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '关键字最长 64 个字符' })
  keyword?: string;
}

/** 我的开票记录查询 */
export class QueryMyInvoiceDto {
  @ApiPropertyOptional({ description: '页签：available 可开票 / processing 开票中 / issued 已开票' })
  @IsOptional()
  @IsIn([...INVOICE_TABS], { message: 'tab 只能是 available / processing / issued' })
  tab?: InvoiceTab;
}

/** 抬头出参 */
export class InvoiceTitleDto {
  @ApiProperty({ description: '抬头 ID' })
  id!: number;

  @ApiProperty({ description: '类型' })
  kind!: InvoiceTitleKind;

  @ApiProperty({ description: '抬头名称' })
  title!: string;

  @ApiProperty({ description: '税号' })
  taxNo!: string | null;

  @ApiProperty({ description: '邮箱' })
  email!: string;

  @ApiProperty({ description: '是否默认' })
  isDefault!: boolean;
}

/** 开票申请出参 */
export class InvoiceDto {
  @ApiProperty({ description: '申请 ID' })
  id!: number;

  @ApiProperty({ description: '订单 ID' })
  orderId!: number;

  @ApiProperty({ description: '订单号' })
  orderNo!: string;

  @ApiProperty({ description: '开票金额（分）= 订单实付' })
  amount!: number;

  @ApiProperty({ description: '抬头类型' })
  kind!: InvoiceTitleKind;

  @ApiProperty({ description: '抬头' })
  title!: string;

  @ApiProperty({ description: '税号' })
  taxNo!: string | null;

  @ApiProperty({ description: '邮箱' })
  email!: string;

  @ApiProperty({ description: '状态' })
  status!: InvoiceStatus;

  @ApiProperty({ description: '状态中文名' })
  statusLabel!: string;

  @ApiProperty({ description: '发票号' })
  invoiceNo!: string | null;

  @ApiProperty({ description: '发票下载地址' })
  invoiceUrl!: string | null;

  @ApiProperty({ description: '顾客备注' })
  remark!: string | null;

  @ApiProperty({ description: '处理说明' })
  handleNote!: string | null;

  @ApiProperty({ description: '申请时间' })
  createdAt!: Date;

  @ApiProperty({ description: '最近处理时间' })
  handledAt!: Date | null;

  @ApiPropertyOptional({ description: '门店 ID（商户侧列表用）' })
  storeId?: number;

  @ApiPropertyOptional({ description: '顾客 ID（商户侧列表用）' })
  customerId?: number;
}

/** 可开票订单一行 */
export class InvoiceableOrderDto {
  @ApiProperty({ description: '订单 ID' })
  orderId!: number;

  @ApiProperty({ description: '订单号' })
  orderNo!: string;

  @ApiProperty({ description: '门店名' })
  storeName!: string;

  @ApiProperty({ description: '可开票金额（分）= 实付' })
  amount!: number;

  @ApiProperty({ description: '完成时间' })
  completedAt!: Date;

  @ApiProperty({ description: '距开票截止还有多少天' })
  remainDays!: number;
}
