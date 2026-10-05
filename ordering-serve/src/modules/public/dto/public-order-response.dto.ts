import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, ORDER_STATUS_LABELS } from '../../../shared/enums/order-status.enum';
import { OrderItem } from '../../order/entities/order-item.entity';
import { Order } from '../../order/entities/order.entity';

/** C 端订单明细 */
export class PublicOrderItemDto {
  @ApiProperty({ description: '菜品名称（下单时快照）', example: '宫保鸡丁' })
  dishName!: string;

  @ApiProperty({ description: '规格摘要', example: '大杯 / 加珍珠' })
  specSummary!: string;

  @ApiProperty({ description: '单价（分，快照）', example: 3800 })
  unitPrice!: number;

  @ApiProperty({ description: '数量', example: 1 })
  quantity!: number;

  @ApiProperty({ description: '小计（分）', example: 3800 })
  subtotal!: number;
}

/**
 * C 端订单查询结果。
 *
 * 只回顾客该看到的：单号、状态、明细与金额。
 * 不回 payToken（它就是本次查询的凭据，不该再往外发）、不回手机号。
 */
export class PublicOrderResponseDto {
  @ApiProperty({ description: '订单号', example: 'O20261005000042' })
  orderNo!: string;

  @ApiProperty({ description: '门店名称', example: '人民路店' })
  storeName!: string;

  @ApiProperty({ description: '订单状态', enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ description: '状态名称', example: '待取餐' })
  statusLabel!: string;

  @ApiProperty({ description: '桌号', nullable: true })
  tableNo!: string | null;

  @ApiProperty({ description: '商品总件数', example: 3 })
  itemCount!: number;

  @ApiProperty({ description: '应付金额（分）', example: 7600 })
  payableAmount!: number;

  @ApiProperty({ description: '实付金额（分），未支付为 null', nullable: true })
  paidAmount!: number | null;

  @ApiProperty({ description: '备注', nullable: true })
  remark!: string | null;

  @ApiProperty({ description: '取消原因', nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ description: '下单时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '支付时间', type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ description: '出餐时间', type: String, format: 'date-time', nullable: true })
  readyAt!: Date | null;

  @ApiProperty({ description: '完成时间', type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ description: '明细', type: [PublicOrderItemDto] })
  items!: PublicOrderItemDto[];

  static from(order: Order, items: OrderItem[], storeName: string): PublicOrderResponseDto {
    const dto = new PublicOrderResponseDto();
    dto.orderNo = order.orderNo;
    dto.storeName = storeName;
    dto.status = order.status;
    dto.statusLabel = ORDER_STATUS_LABELS[order.status];
    dto.tableNo = order.tableNo;
    dto.itemCount = order.itemCount;
    dto.payableAmount = order.payableAmount;
    dto.paidAmount = order.paidAmount;
    dto.remark = order.remark;
    dto.cancelReason = order.cancelReason;
    dto.createdAt = order.createdAt;
    dto.paidAt = order.paidAt;
    dto.readyAt = order.readyAt;
    dto.completedAt = order.completedAt;
    dto.items = items.map((item) => {
      const line = new PublicOrderItemDto();
      line.dishName = item.dishName;
      line.specSummary = item.specSummary;
      line.unitPrice = item.unitPrice;
      line.quantity = item.quantity;
      line.subtotal = item.subtotal;
      return line;
    });
    return dto;
  }
}
