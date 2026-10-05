import { ApiProperty } from '@nestjs/swagger';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../shared/enums/order-status.enum';

/** 订单状态计数（商户端概览用） */
export class OrderStatusCountDto {
  @ApiProperty({ description: '订单状态', enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ description: '状态名称', example: '待支付' })
  statusLabel!: string;

  @ApiProperty({ description: '订单数量', example: 3 })
  count!: number;

  static from(status: OrderStatus, count: number): OrderStatusCountDto {
    const dto = new OrderStatusCountDto();
    dto.status = status;
    dto.statusLabel = ORDER_STATUS_LABELS[status];
    dto.count = count;
    return dto;
  }
}
