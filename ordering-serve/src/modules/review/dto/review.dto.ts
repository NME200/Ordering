import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** 提交评价 */
export class CreateReviewDto {
  @ApiProperty({ description: '订单 ID（必须是本人已完成的订单）' })
  @Type(() => Number)
  @IsInt({ message: 'orderId 必须为整数' })
  @Min(1, { message: 'orderId 最小为 1' })
  orderId!: number;

  @ApiProperty({ description: '总体评分 1-5', example: 5 })
  @Type(() => Number)
  @IsInt({ message: 'rating 必须为整数' })
  @Min(1, { message: '评分最低 1 星' })
  @Max(5, { message: '评分最高 5 星' })
  rating!: number;

  @ApiPropertyOptional({ description: '标签', type: [String] })
  @IsOptional()
  @IsArray({ message: 'tags 必须为数组' })
  @ArrayMaxSize(6, { message: '标签最多 6 个' })
  @IsString({ each: true, message: 'tags 元素必须为字符串' })
  tags?: string[];

  @ApiPropertyOptional({ description: '文字评价', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '评价内容最长 500 个字符' })
  content?: string;

  @ApiPropertyOptional({ description: '图片地址列表', type: [String] })
  @IsOptional()
  @IsArray({ message: 'images 必须为数组' })
  @ArrayMaxSize(6, { message: '图片最多 6 张' })
  @IsString({ each: true, message: 'images 元素必须为字符串' })
  images?: string[];

  @ApiPropertyOptional({ description: '是否匿名', default: false })
  @IsOptional()
  @Type(() => Boolean)
  anonymous?: boolean;
}

/** 商家回复 */
export class ReplyReviewDto {
  @ApiProperty({ description: '回复内容', maxLength: 500 })
  @IsString()
  @MaxLength(500, { message: '回复最长 500 个字符' })
  content!: string;
}

/** 商户侧评价列表查询 */
export class QueryReviewDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '商户 ID（平台侧筛某商户）' })
  @IsOptional()
  @Type(() => Number)
  merchantId?: number;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @Type(() => Number)
  storeId?: number;

  @ApiPropertyOptional({ description: '按星级筛选' })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'rating 最低 1' })
  @Max(5, { message: 'rating 最高 5' })
  rating?: number;

  @ApiPropertyOptional({ description: '只看未回复：1' })
  @IsOptional()
  @Type(() => Number)
  unrepliedOnly?: number;
}

/** 评价出参 */
export class ReviewDto {
  @ApiProperty({ description: '评价 ID' })
  id!: number;

  @ApiProperty({ description: '订单 ID' })
  orderId!: number;

  @ApiProperty({ description: '订单号' })
  orderNo!: string;

  @ApiProperty({ description: '门店 ID' })
  storeId!: number;

  @ApiProperty({ description: '评分' })
  rating!: number;

  @ApiProperty({ description: '标签' })
  tags!: string[];

  @ApiProperty({ description: '文字评价' })
  content!: string | null;

  @ApiProperty({ description: '图片' })
  images!: string[];

  @ApiProperty({ description: '是否匿名' })
  anonymous!: boolean;

  @ApiProperty({ description: '评价人昵称（匿名时已打码）' })
  customerName!: string;

  @ApiProperty({ description: '本次赠送的积分' })
  pointAwarded!: number;

  @ApiProperty({ description: '商家回复' })
  replyContent!: string | null;

  @ApiProperty({ description: '回复时间' })
  repliedAt!: Date | null;

  @ApiProperty({ description: '评价时间' })
  createdAt!: Date;
}
