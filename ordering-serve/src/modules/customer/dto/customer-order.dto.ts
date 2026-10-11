import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ORDER_BUCKETS, OrderBucket } from '../../../shared/enums/customer.enum';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../shared/enums/order-status.enum';

/** 「我的订单」列表查询 */
export class QueryCustomerOrderDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: '订单桶：unpaid 待付款 / processing 待使用 / review 待评价 / refund 退款售后。不传表示全部',
    enum: ORDER_BUCKETS,
  })
  @IsOptional()
  @IsIn([...ORDER_BUCKETS], { message: 'bucket 只能是 unpaid / processing / review / refund' })
  bucket?: OrderBucket;

  @ApiPropertyOptional({ description: '只看某商户的订单' })
  @IsOptional()
  @Type(() => Number)
  merchantId?: number;
}

/** 列表行内的菜品摘要 */
export class CustomerOrderItemDto {
  @ApiProperty({ description: '菜品名（下单时快照）' })
  dishName!: string;

  @ApiPropertyOptional({ description: '菜品图' })
  dishImageUrl!: string | null;

  @ApiProperty({ description: '规格摘要，如「大杯 / 加珍珠」' })
  specSummary!: string;

  @ApiProperty({ description: '单价（分，菜品本体价）' })
  unitPrice!: number;

  @ApiProperty({ description: '规格增量合计（分）' })
  specAmount!: number;

  @ApiProperty({ description: '数量' })
  quantity!: number;

  @ApiProperty({ description: '小计（分）' })
  subtotal!: number;
}

/** 「我的订单」行 */
export class CustomerOrderDto {
  @ApiProperty({ description: '订单 ID' })
  id!: number;

  @ApiProperty({ description: '订单号' })
  orderNo!: string;

  @ApiProperty({ description: '状态码' })
  status!: OrderStatus;

  @ApiProperty({ description: '状态中文名' })
  statusLabel!: string;

  @ApiProperty({ description: '门店 ID' })
  storeId!: number;

  @ApiProperty({ description: '门店名' })
  storeName!: string;

  @ApiProperty({ description: '商品总额（分）' })
  totalAmount!: number;

  @ApiProperty({ description: '优惠金额（分）' })
  discountAmount!: number;

  @ApiProperty({ description: '应付（分）' })
  payableAmount!: number;

  @ApiPropertyOptional({ description: '实付（分），未支付为 null' })
  paidAmount!: number | null;

  @ApiProperty({ description: '件数' })
  itemCount!: number;

  @ApiProperty({ description: '就餐方式：0 堂食 / 1 自提 / 2 外卖' })
  diningType!: number;

  @ApiPropertyOptional({ description: '桌号' })
  tableNo!: string | null;

  @ApiPropertyOptional({ description: '取餐码（仅自提单，柜台前报这个号）', example: '0042' })
  pickupCode!: string | null;

  @ApiPropertyOptional({ description: '收货信息快照（外卖单）' })
  addressSnapshot!: string | null;

  @ApiPropertyOptional({ description: '备注' })
  remark!: string | null;

  @ApiProperty({ description: '下单时间' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: '支付时间' })
  paidAt!: Date | null;

  @ApiPropertyOptional({ description: '完成时间' })
  completedAt!: Date | null;

  @ApiPropertyOptional({ description: '取消时间' })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ description: '取消原因' })
  cancelReason!: string | null;

  /**
   * 支付方式文案（如「模拟支付」「线下收款」）。
   *
   * 取自支付流水而不是订单本身：订单表没有存渠道，而设计稿的「订单信息」里
   * 这一行要回答的是「我到底用什么付的」，只有成功的那笔支付单说得清。
   */
  @ApiPropertyOptional({ description: '支付方式；未支付为 null' })
  paidChannelLabel!: string | null;

  @ApiProperty({
    description: '是否可评价：已完成且尚未评价。列表页据此显示「去评价」按钮',
  })
  canReview!: boolean;

  @ApiProperty({ description: '是否属于「退款售后」桶（已支付后被取消）' })
  refunded!: boolean;

  @ApiProperty({ description: '菜品明细', type: [CustomerOrderItemDto] })
  items!: CustomerOrderItemDto[];
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? '未知状态';
}
