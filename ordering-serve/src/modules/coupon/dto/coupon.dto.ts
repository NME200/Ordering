import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  COUPON_SCENE_VALUES,
  COUPON_TYPE_VALUES,
  CouponScene,
  CouponTemplateStatus,
  CouponType,
  MAX_COUPON_DISCOUNT_CENT,
} from '../../../shared/enums/coupon.enum';
import { COUPON_TABS, CouponTab } from '../../../shared/enums/coupon.enum';

/** 券面额上限（分）：满减券 999 元封顶，防止把「满 100 减 10000」配成负毛利 */
const MAX_COUPON_VALUE_CENT = 99900;

/** 新建 / 修改券模板 */
export class UpsertCouponTemplateDto {
  @ApiProperty({ description: '券名，如「满 30 减 5」', maxLength: 64 })
  @IsString()
  @MaxLength(64, { message: '券名最长 64 个字符' })
  name!: string;

  @ApiProperty({ description: '类型：amount 满减 / discount 折扣', enum: CouponType })
  @IsIn(COUPON_TYPE_VALUES, { message: 'type 只能是 amount 或 discount' })
  type!: CouponType;

  @ApiProperty({
    description: '满减为减免金额（分）；折扣为折扣率百分数（80 = 打 8 折）',
    example: 500,
  })
  @Type(() => Number)
  @IsInt({ message: 'value 必须为整数' })
  @Min(1, { message: 'value 必须大于 0' })
  value!: number;

  @ApiPropertyOptional({ description: '使用门槛（分），0 表示无门槛', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'threshold 必须为整数' })
  @Min(0, { message: 'threshold 不能为负' })
  threshold?: number;

  @ApiPropertyOptional({ description: '最多抵扣（分），仅折扣券有意义；不填表示不限' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxDiscount 必须为整数' })
  @Min(1, { message: 'maxDiscount 至少为 1' })
  maxDiscount?: number;

  @ApiPropertyOptional({
    description: '场景：normal 领券中心 / newcomer 新客自动发 / birthday 生日当月领',
    enum: CouponScene,
    default: CouponScene.NORMAL,
  })
  @IsOptional()
  @IsIn(COUPON_SCENE_VALUES, { message: 'scene 取值不合法' })
  scene?: CouponScene;

  @ApiPropertyOptional({ description: '领取后有效天数（与固定区间二选一）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validDays 必须为整数' })
  @Min(1, { message: 'validDays 至少为 1' })
  @Max(3650, { message: 'validDays 最大 3650' })
  validDays?: number;

  @ApiPropertyOptional({ description: '固定有效期开始，ISO 时间（与 validDays 二选一）' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'startAt 格式应为 YYYY-MM-DD' })
  startAt?: string;

  @ApiPropertyOptional({ description: '固定有效期结束，ISO 时间' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'endAt 格式应为 YYYY-MM-DD' })
  endAt?: string;

  @ApiPropertyOptional({ description: '发行总量，0 表示不限量', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'totalCount 必须为整数' })
  @Min(0, { message: 'totalCount 不能为负' })
  totalCount?: number;

  @ApiPropertyOptional({ description: '每人限领张数', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'perLimit 必须为整数' })
  @Min(1, { message: 'perLimit 至少为 1' })
  @Max(20, { message: 'perLimit 最大 20' })
  perLimit?: number;

  @ApiPropertyOptional({ description: '使用说明', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '使用说明最长 255 个字符' })
  description?: string;

  @ApiPropertyOptional({ description: '状态：1 上架 / 0 下架', enum: CouponTemplateStatus })
  @IsOptional()
  @Type(() => Number)
  @IsIn([CouponTemplateStatus.ONLINE, CouponTemplateStatus.OFFLINE], {
    message: 'status 只能是 0（下架）或 1（上架）',
  })
  status?: CouponTemplateStatus;

  @ApiPropertyOptional({
    description: '商户 ID。**仅平台侧可填**（平台券留空表示全场通用）；商户侧一律取 Token',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;
}

/** 券模板列表查询 */
export class QueryCouponTemplateDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '商户 ID（平台侧筛某商户）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '场景筛选', enum: CouponScene })
  @IsOptional()
  @IsIn(COUPON_SCENE_VALUES, { message: 'scene 取值不合法' })
  scene?: CouponScene;

  @ApiPropertyOptional({ description: '状态筛选：1 上架 / 0 下架' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([CouponTemplateStatus.ONLINE, CouponTemplateStatus.OFFLINE], { message: 'status 只能是 0（下架）或 1（上架）' })
  status?: CouponTemplateStatus;

  @ApiPropertyOptional({ description: '只看平台券' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1], { message: 'platformOnly 只能是 0 或 1' })
  platformOnly?: number;
}

/** 领取券 */
export class ReceiveCouponDto {
  @ApiProperty({ description: '券模板 ID' })
  @Type(() => Number)
  @IsInt({ message: 'templateId 必须为整数' })
  @Min(1, { message: 'templateId 最小为 1' })
  templateId!: number;
}

/** 我的券查询 */
export class QueryMyCouponDto {
  @ApiPropertyOptional({ description: '页签：unused / used / expired', enum: COUPON_TABS })
  @IsOptional()
  @IsIn([...COUPON_TABS], { message: 'tab 只能是 unused / used / expired' })
  tab?: CouponTab;

  @ApiPropertyOptional({ description: '限定商户（下单选券时按当前门店的商户过滤）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  merchantId?: number;
}

/** 券模板出参 */
export class CouponTemplateDto {
  @ApiProperty({ description: '模板 ID' })
  id!: number;

  @ApiPropertyOptional({ description: '所属商户 ID；null = 平台券' })
  merchantId!: number | null;

  @ApiProperty({ description: '券名' })
  name!: string;

  @ApiProperty({ description: '类型' })
  type!: CouponType;

  @ApiProperty({ description: '面额或折扣率' })
  value!: number;

  @ApiProperty({ description: '门槛（分）' })
  threshold!: number;

  @ApiPropertyOptional({ description: '最多抵扣（分）' })
  maxDiscount!: number | null;

  @ApiProperty({ description: '场景' })
  scene!: CouponScene;

  @ApiPropertyOptional({ description: '领取后有效天数' })
  validDays!: number | null;

  @ApiPropertyOptional({ description: '固定区间开始' })
  startAt!: Date | null;

  @ApiPropertyOptional({ description: '固定区间结束' })
  endAt!: Date | null;

  @ApiProperty({ description: '发行总量，0 = 不限' })
  totalCount!: number;

  @ApiProperty({ description: '已领取数量' })
  receivedCount!: number;

  @ApiProperty({ description: '每人限领' })
  perLimit!: number;

  @ApiPropertyOptional({ description: '使用说明' })
  description!: string | null;

  @ApiProperty({ description: '状态：1 上架 / 0 下架' })
  status!: CouponTemplateStatus;

  @ApiProperty({ description: '券面文案：「¥5」「8折」，服务端算好，避免三端各写一份' })
  faceValue!: string;

  @ApiProperty({ description: '门槛文案：「满30可用」「全场通用」' })
  thresholdText!: string;

  @ApiProperty({ description: '剩余可领数量；null 表示不限量' })
  remain!: number | null;
}

/** 顾客持有的券 */
export class CustomerCouponDto {
  @ApiProperty({ description: '持有券 ID' })
  id!: number;

  @ApiProperty({ description: '来源模板 ID' })
  templateId!: number;

  @ApiPropertyOptional({ description: '归属商户；null = 平台券' })
  merchantId!: number | null;

  @ApiProperty({ description: '券名快照' })
  name!: string;

  @ApiProperty({ description: '类型' })
  type!: CouponType;

  @ApiProperty({ description: '面额或折扣率' })
  value!: number;

  @ApiProperty({ description: '门槛（分）' })
  threshold!: number;

  @ApiPropertyOptional({ description: '最多抵扣（分）' })
  maxDiscount!: number | null;

  @ApiProperty({ description: '场景' })
  scene!: CouponScene;

  @ApiProperty({ description: '失效时间' })
  expireAt!: Date;

  @ApiProperty({ description: '状态' })
  status!: string;

  @ApiProperty({ description: '券面文案' })
  faceValue!: string;

  @ApiProperty({ description: '门槛文案' })
  thresholdText!: string;

  @ApiProperty({ description: '领取时间' })
  receivedAt!: Date;

  @ApiPropertyOptional({ description: '核销时间' })
  usedAt!: Date | null;

  @ApiProperty({ description: '当前订单是否可用（下单选券页用）' })
  usable!: boolean;

  @ApiPropertyOptional({ description: '不可用原因，置灰时展示' })
  unusableReason!: string | null;

  @ApiProperty({ description: '本单预计抵扣（分）' })
  discountPreview!: number;
}

/** 领券中心一行 */
export class CouponCenterItemDto {
  @ApiProperty({ description: '模板 ID' })
  id!: number;

  @ApiProperty({ description: '券名' })
  name!: string;

  @ApiProperty({ description: '类型' })
  type!: CouponType;

  @ApiProperty({ description: '面额或折扣率' })
  value!: number;

  @ApiProperty({ description: '门槛（分）' })
  threshold!: number;

  @ApiPropertyOptional({ description: '最多抵扣（分）' })
  maxDiscount!: number | null;

  @ApiProperty({ description: '券面文案' })
  faceValue!: string;

  @ApiProperty({ description: '门槛文案' })
  thresholdText!: string;

  @ApiProperty({ description: '使用说明' })
  description!: string | null;

  @ApiProperty({ description: '失效时间（相对有效期时按现在+天数估算，仅供展示）' })
  expireAt!: Date | null;

  @ApiProperty({ description: '当前顾客是否还能领' })
  receivable!: boolean;

  @ApiProperty({ description: '不可领原因' })
  reason!: string | null;

  @ApiProperty({ description: '已领张数' })
  receivedByMe!: number;
}

/** 抵扣上限，供服务层引用 */
export const COUPON_DISCOUNT_CAP = MAX_COUPON_DISCOUNT_CENT;
/** 面额上限，供校验器引用 */
export const COUPON_VALUE_CAP = MAX_COUPON_VALUE_CENT;
