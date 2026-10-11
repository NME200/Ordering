import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DINING_TYPE_VALUES, DiningType } from '../../../shared/enums/dining-type.enum';
import { MAX_ORDER_ITEM_LINES, MAX_ORDER_QUANTITY_PER_LINE } from '../constants/order-limits';

/** 单个下单菜品入参 */
export class CreateOrderItemDto {
  @ApiProperty({ description: '菜品 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'dishId 必须为整数' })
  @Min(1, { message: 'dishId 最小为 1' })
  dishId!: number;

  @ApiProperty({
    description: '数量',
    example: 2,
    minimum: 1,
    maximum: MAX_ORDER_QUANTITY_PER_LINE,
  })
  @Type(() => Number)
  @IsInt({ message: 'quantity 必须为整数' })
  @Min(1, { message: '数量至少为 1' })
  @Max(MAX_ORDER_QUANTITY_PER_LINE, {
    message: `单个菜品数量最大为 ${MAX_ORDER_QUANTITY_PER_LINE}`,
  })
  quantity!: number;

  @ApiPropertyOptional({
    description: '所选规格项 ID 列表（同一规格组内单选，跨组可多选）',
    type: [Number],
    example: [2, 3],
  })
  @IsOptional()
  @IsArray({ message: 'specOptionIds 必须为数组' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'specOptionIds 元素必须为整数' })
  @ArrayUnique({ message: 'specOptionIds 不能重复' })
  specOptionIds?: number[];
}

/**
 * 创建订单入参。
 *
 * **安全约定**：这里刻意不接收任何价格字段，所有金额一律由服务端
 * 依据菜品当前价 + 规格增量重新计算，杜绝前端篡改价格。
 */
export class CreateOrderDto {
  @ApiProperty({ description: '门店 ID（扫码点餐时由桌台码解析得到）', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId!: number;

  @ApiProperty({
    description: `商品明细（1 ~ ${MAX_ORDER_ITEM_LINES} 项）`,
    type: [CreateOrderItemDto],
  })
  @IsArray({ message: 'items 必须为数组' })
  @ArrayMinSize(1, { message: '订单至少包含 1 个商品' })
  @ArrayMaxSize(MAX_ORDER_ITEM_LINES, {
    message: `单笔订单最多 ${MAX_ORDER_ITEM_LINES} 行明细`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description: '幂等令牌：建议客户端生成 UUID。相同令牌重复提交只会创建一笔订单',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'clientToken 最长 64 个字符' })
  clientToken?: string;

  @ApiPropertyOptional({ description: '下单人称呼', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '下单人称呼最长 32 个字符' })
  customerName?: string;

  @ApiPropertyOptional({ description: '下单人手机号', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号最长 20 个字符' })
  customerPhone?: string;

  @ApiPropertyOptional({ description: '桌号（堂食扫码）', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '桌号最长 16 个字符' })
  tableNo?: string;

  @ApiPropertyOptional({
    description: '就餐方式：0 堂食 / 1 自提 / 2 外卖配送。只记录与展示，不影响价格',
    enum: DiningType,
    default: DiningType.DINE_IN,
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(DINING_TYPE_VALUES, { message: 'diningType 只能是 0（堂食）/ 1（自提）/ 2（外卖）' })
  diningType?: DiningType;

  @ApiPropertyOptional({ description: '备注，如「不要葱」', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;

  /**
   * 用券。
   *
   * 只接受券 ID，**抵扣金额一律由服务端算**：把 discountAmount 交给前端传，
   * 等于任何人都能下一张「0 元购」的单。
   */
  @ApiPropertyOptional({ description: '使用的顾客券 ID（须属于本人且适用于该门店）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'couponId 必须为整数' })
  @Min(1, { message: 'couponId 最小为 1' })
  couponId?: number;

  @ApiPropertyOptional({ description: '收货地址 ID（外卖配送单必填，须属于本人）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'addressId 必须为整数' })
  @Min(1, { message: 'addressId 最小为 1' })
  addressId?: number;
}
