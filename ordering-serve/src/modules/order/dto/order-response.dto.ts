import { ApiProperty } from '@nestjs/swagger';
import { DINING_TYPE_LABELS, DiningType } from '../../../shared/enums/dining-type.enum';
import { ORDER_SOURCE_LABELS, OrderSource } from '../../../shared/enums/order-source.enum';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../shared/enums/order-status.enum';
import { OrderItemSpec } from '../entities/order-item-spec.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Order } from '../entities/order.entity';

/** 订单明细的规格快照出参 */
export class OrderItemSpecResponseDto {
  @ApiProperty({ description: '规格组 ID', example: 1 })
  specGroupId!: number;

  @ApiProperty({ description: '规格组名称（快照）', example: '杯型' })
  specGroupName!: string;

  @ApiProperty({ description: '规格项 ID', example: 2 })
  specOptionId!: number;

  @ApiProperty({ description: '规格项名称（快照）', example: '大杯' })
  specOptionName!: string;

  @ApiProperty({ description: '价格增量（分，快照）', example: 300 })
  priceDiff!: number;

  static from(entity: OrderItemSpec): OrderItemSpecResponseDto {
    const dto = new OrderItemSpecResponseDto();
    dto.specGroupId = entity.specGroupId;
    dto.specGroupName = entity.specGroupName;
    dto.specOptionId = entity.specOptionId;
    dto.specOptionName = entity.specOptionName;
    dto.priceDiff = entity.priceDiff;
    return dto;
  }
}

/** 订单明细出参 */
export class OrderItemResponseDto {
  @ApiProperty({ description: '明细 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '菜品 ID', example: 3 })
  dishId!: number;

  @ApiProperty({ description: '菜品名称（下单时快照）', example: '招牌奶茶' })
  dishName!: string;

  @ApiProperty({ description: '菜品图片（下单时快照）', nullable: true })
  dishImageUrl!: string | null;

  @ApiProperty({ description: '菜品基础单价（分，快照）', example: 1200 })
  unitPrice!: number;

  @ApiProperty({ description: '规格增量合计（分/份）', example: 500 })
  specAmount!: number;

  @ApiProperty({ description: '规格摘要文字', example: '大杯 / 加珍珠' })
  specSummary!: string;

  @ApiProperty({ description: '数量', example: 2 })
  quantity!: number;

  @ApiProperty({ description: '小计（分）', example: 3400 })
  subtotal!: number;

  @ApiProperty({ description: '所选规格明细', type: [OrderItemSpecResponseDto] })
  specs!: OrderItemSpecResponseDto[];

  static from(entity: OrderItem, specs: OrderItemSpec[] = []): OrderItemResponseDto {
    const dto = new OrderItemResponseDto();
    dto.id = entity.id;
    dto.dishId = entity.dishId;
    dto.dishName = entity.dishName;
    dto.dishImageUrl = entity.dishImageUrl;
    dto.unitPrice = entity.unitPrice;
    dto.specAmount = entity.specAmount;
    dto.specSummary = entity.specSummary;
    dto.quantity = entity.quantity;
    dto.subtotal = entity.subtotal;
    dto.specs = specs.map((spec) => OrderItemSpecResponseDto.from(spec));
    return dto;
  }
}

/** 订单出参 */
export class OrderResponseDto {
  @ApiProperty({ description: '订单 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '订单号（对外展示）', example: 'O20261005000001' })
  orderNo!: string;

  @ApiProperty({ description: '所属商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '门店 ID', example: 1 })
  storeId!: number;

  @ApiProperty({ description: '订单来源', enum: OrderSource, example: OrderSource.SCAN })
  source!: OrderSource;

  @ApiProperty({ description: '订单来源名称', example: '扫码点餐' })
  sourceLabel!: string;

  @ApiProperty({ description: '下单账号 ID；C 端扫码下单为 null', nullable: true, example: 3 })
  createdBy!: number | null;

  @ApiProperty({ description: '下单账号姓名快照；C 端扫码下单为 null', nullable: true, example: '李四' })
  createdByName!: string | null;

  @ApiProperty({ description: '订单状态', enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ description: '订单状态名称', example: '待支付' })
  statusLabel!: string;

  @ApiProperty({ description: '商品总额（分）', example: 7200 })
  totalAmount!: number;

  @ApiProperty({ description: '优惠金额（分）', example: 0 })
  discountAmount!: number;

  @ApiProperty({ description: '应付金额（分）', example: 7200 })
  payableAmount!: number;

  @ApiProperty({ description: '实付金额（分）', nullable: true, example: 7200 })
  paidAmount!: number | null;

  @ApiProperty({ description: '商品总件数', example: 3 })
  itemCount!: number;

  @ApiProperty({ description: '下单人称呼', nullable: true })
  customerName!: string | null;

  @ApiProperty({ description: '下单人手机号', nullable: true })
  customerPhone!: string | null;

  @ApiProperty({ description: '桌号', nullable: true })
  tableNo!: string | null;

  @ApiProperty({
    description: '取餐码（仅自提单，门店当天序号）。店员在柜台前喊的就是它，别拿订单号代替',
    nullable: true,
    example: '0042',
  })
  pickupCode!: string | null;

  @ApiProperty({ description: '就餐方式：0 堂食 / 1 自提 / 2 外卖配送', enum: DiningType })
  diningType!: DiningType;

  @ApiProperty({ description: '就餐方式名称', example: '堂食' })
  diningTypeLabel!: string;

  @ApiProperty({
    description: '收货信息快照（仅外卖单有，下单时按「姓名 电话 详细地址」拼好）。店员按它送',
    nullable: true,
    example: '张三 13800001111 浙江省杭州市西湖区文三路 100 号 5 楼',
  })
  addressSnapshot!: string | null;

  @ApiProperty({ description: '备注', nullable: true })
  remark!: string | null;

  @ApiProperty({ description: '支付时间', nullable: true, type: String, format: 'date-time' })
  paidAt!: Date | null;

  @ApiProperty({ description: '接单时间', nullable: true, type: String, format: 'date-time' })
  acceptedAt!: Date | null;

  @ApiProperty({ description: '出餐时间', nullable: true, type: String, format: 'date-time' })
  readyAt!: Date | null;

  @ApiProperty({ description: '完成时间', nullable: true, type: String, format: 'date-time' })
  completedAt!: Date | null;

  @ApiProperty({ description: '取消时间', nullable: true, type: String, format: 'date-time' })
  cancelledAt!: Date | null;

  @ApiProperty({ description: '取消原因', nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ description: '下单时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ description: '订单明细', type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({
    description:
      '支付票据：**仅在下单响应中返回**，客户端需自行保存并用于 POST /orders/:id/pay。' +
      '列表与详情接口不返回该字段，避免拿到别人订单的票据。',
    nullable: true,
    example: '3f6f0b8c-4c1e-4a37-9d0e-7b1f2c8a5d11',
  })
  payToken!: string | null;

  static from(entity: Order, items: OrderItemResponseDto[] = [], withPayToken = false): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = entity.id;
    dto.orderNo = entity.orderNo;
    dto.merchantId = entity.merchantId;
    dto.storeId = entity.storeId;
    dto.source = entity.source;
    dto.sourceLabel = ORDER_SOURCE_LABELS[entity.source];
    dto.createdBy = entity.createdBy;
    dto.createdByName = entity.createdByName;
    dto.status = entity.status;
    dto.statusLabel = ORDER_STATUS_LABELS[entity.status];
    dto.totalAmount = entity.totalAmount;
    dto.discountAmount = entity.discountAmount;
    dto.payableAmount = entity.payableAmount;
    dto.paidAmount = entity.paidAmount;
    dto.itemCount = entity.itemCount;
    dto.customerName = entity.customerName;
    dto.customerPhone = entity.customerPhone;
    dto.tableNo = entity.tableNo;
    dto.pickupCode = entity.pickupCode;
    dto.diningType = entity.diningType;
    dto.diningTypeLabel = DINING_TYPE_LABELS[entity.diningType];
    dto.addressSnapshot = entity.addressSnapshot;
    dto.remark = entity.remark;
    dto.paidAt = entity.paidAt;
    dto.acceptedAt = entity.acceptedAt;
    dto.readyAt = entity.readyAt;
    dto.completedAt = entity.completedAt;
    dto.cancelledAt = entity.cancelledAt;
    dto.cancelReason = entity.cancelReason;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    dto.items = items;
    dto.payToken = withPayToken ? entity.payToken : null;
    return dto;
  }
}
