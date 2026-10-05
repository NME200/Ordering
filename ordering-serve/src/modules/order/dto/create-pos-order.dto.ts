import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_ORDER_ITEM_LINES } from '../constants/order-limits';
import { CreateOrderItemDto } from './create-order.dto';

/**
 * 收银台代客开单入参（POS）。
 *
 * 与 C 端扫码下单（CreateOrderDto）的差别：
 * - **门店由服务端从 Token 解析**：收银员 / 门店管理员不能跨店开单；
 *   商户管理员下辖多门店，必须显式指定 storeId；
 * - 操作人会写入订单的 `created_by`，便于对账与追责。
 *
 * 同样**不接收任何价格字段**，金额一律由服务端按菜单现价重算。
 */
export class CreatePosOrderDto {
  @ApiPropertyOptional({
    description: '下单门店 ID。收银员 / 门店管理员可不传（取 Token 所属门店）；商户管理员必传',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

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
    description: '幂等令牌：建议收银端在进入开单页时生成，防止重复点击产生多单',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'clientToken 最长 64 个字符' })
  clientToken?: string;

  @ApiPropertyOptional({ description: '顾客称呼', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '顾客称呼最长 32 个字符' })
  customerName?: string;

  @ApiPropertyOptional({ description: '顾客手机号（叫号 / 联系用）', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号最长 20 个字符' })
  customerPhone?: string;

  @ApiPropertyOptional({ description: '桌号（堂食）', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '桌号最长 16 个字符' })
  tableNo?: string;

  @ApiPropertyOptional({ description: '备注，如「不要葱」', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;
}
