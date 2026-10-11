import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { resolveMemberLevel } from '../../../shared/enums/customer.enum';
import { maskPhone } from '../../../shared/utils/mask.util';
import type { MemberProfile } from '../entities/member-profile.entity';

/** 商户 / 平台侧顾客列表查询 */
export class QueryCustomerAdminDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '手机号或昵称关键字' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '关键字最长 32 个字符' })
  keyword?: string;

  @ApiPropertyOptional({ description: '状态筛选：1 正常 / 0 封禁', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsIn([CommonStatus.ENABLED, CommonStatus.DISABLED], { message: 'status 只能是 0 或 1' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: '商户 ID（平台侧查看指定商户时使用）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  merchantId?: number;
}

/** 顾客列表行 */
export class CustomerAdminRowDto {
  @ApiProperty({ description: '顾客 ID' })
  id!: number;

  @ApiPropertyOptional({ description: '昵称' })
  nickname!: string | null;

  @ApiPropertyOptional({ description: '手机号（打码）', example: '138****8000' })
  phone!: string | null;

  @ApiProperty({ description: '是否已绑定手机号' })
  phoneBound!: boolean;

  @ApiProperty({ description: '注册时间' })
  createdAt!: Date;

  @ApiProperty({ description: '在本商户的积分；未建档为 0' })
  point!: number;

  @ApiProperty({ description: '在本商户的储值余额（分）' })
  balance!: number;

  @ApiProperty({ description: '在本商户的成长值' })
  growth!: number;

  @ApiProperty({ description: '等级名' })
  levelName!: string;

  @ApiProperty({ description: '已支付订单数' })
  orderCount!: number;

  @ApiProperty({ description: '可用优惠券张数' })
  couponCount!: number;

  @ApiProperty({ description: '状态：1 正常 / 0 封禁' })
  status!: CommonStatus;

  static from(
    customer: {
      id: number;
      nickname: string | null;
      phone: string | null;
      createdAt: Date;
      status: CommonStatus;
    },
    profile: MemberProfile | null,
    couponCount: number,
    merchantId: number | null,
  ): CustomerAdminRowDto {
    const dto = new CustomerAdminRowDto();
    dto.id = customer.id;
    dto.nickname = customer.nickname;
    dto.phone = maskPhone(customer.phone);
    dto.phoneBound = Boolean(customer.phone);
    dto.createdAt = customer.createdAt;
    dto.point = profile?.point ?? 0;
    dto.balance = profile?.balance ?? 0;
    dto.growth = profile?.growth ?? 0;
    dto.levelName = merchantId === null ? '—' : resolveMemberLevel(profile?.growth ?? 0).name;
    dto.orderCount = profile?.orderCount ?? 0;
    dto.couponCount = couponCount;
    dto.status = customer.status;
    return dto;
  }
}
