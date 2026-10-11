import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberLevel, OrderBucket, ORDER_BUCKETS, ORDER_BUCKET_LABELS } from '../../../shared/enums/customer.enum';
import { maskPhone } from '../../../shared/utils/mask.util';

/** 顾客资料出参。手机号在这里就打码，明文永不出服务端 */
export class CustomerProfileDto {
  @ApiProperty({ description: '顾客 ID，「我的」页展示的 ID 就是它', example: 10044 })
  id!: number;

  @ApiPropertyOptional({ description: '昵称，未填为 null，前端按「食客 + ID 后四位」显示' })
  nickname!: string | null;

  @ApiPropertyOptional({ description: '头像地址' })
  avatar!: string | null;

  @ApiProperty({ description: '性别：0 未填写 / 1 男 / 2 女' })
  gender!: number;

  @ApiPropertyOptional({ description: '生日 YYYY-MM-DD' })
  birthday!: string | null;

  @ApiPropertyOptional({ description: '手机号（已打码）', example: '138****8000' })
  phone!: string | null;

  @ApiProperty({ description: '是否已绑定手机号。未绑定时资产区点击要引导绑定' })
  phoneBound!: boolean;

  @ApiProperty({ description: '邀请码，用于分享拉新（成长任务「邀请好友注册」）' })
  inviteCode!: string | null;

  @ApiProperty({ description: '有效邀请人数（被邀请人已绑定手机号才算）' })
  inviteCount!: number;

  static from(
    customer: {
      id: number;
      nickname: string | null;
      avatar: string | null;
      gender: number;
      birthday: string | null;
      phone: string | null;
      inviteCode: string | null;
    },
    inviteCount: number,
  ): CustomerProfileDto {
    const dto = new CustomerProfileDto();
    dto.id = customer.id;
    dto.nickname = customer.nickname;
    dto.avatar = customer.avatar;
    dto.gender = customer.gender;
    dto.birthday = customer.birthday;
    dto.phone = maskPhone(customer.phone);
    dto.phoneBound = Boolean(customer.phone);
    dto.inviteCode = customer.inviteCode;
    dto.inviteCount = inviteCount;
    return dto;
  }
}

/** 商户维度会员资产 */
export class MemberAssetDto {
  @ApiProperty({ description: '所属商户 ID；0 表示未指定商户，此时资产全为 0' })
  merchantId!: number;

  @ApiProperty({ description: '积分' })
  point!: number;

  @ApiProperty({ description: '储值余额（分）' })
  balance!: number;

  @ApiProperty({ description: '成长值 = 累计实付元数' })
  growth!: number;

  @ApiProperty({ description: '等级序号' })
  level!: number;

  @ApiProperty({ description: '等级名，如「黄金会员」' })
  levelName!: string;

  @ApiPropertyOptional({ description: '下一等级；已是最高级为 null' })
  nextLevel!: (MemberLevel & { remainGrowth: number }) | null;

  @ApiProperty({ description: '可用优惠券张数' })
  couponCount!: number;

  @ApiProperty({ description: '累计实付（分）' })
  totalPaid!: number;

  @ApiProperty({ description: '已支付订单数' })
  orderCount!: number;
}

/** 「我的」页订单四桶计数 */
export class CustomerOrderCountDto {
  @ApiProperty({ description: '各桶数量，key 是桶名', example: { unpaid: 1, processing: 2, review: 0, refund: 0 } })
  buckets!: Record<OrderBucket, number>;

  static from(counts: Partial<Record<OrderBucket, number>>): CustomerOrderCountDto {
    const dto = new CustomerOrderCountDto();
    dto.buckets = Object.fromEntries(
      ORDER_BUCKETS.map((bucket) => [bucket, counts[bucket] ?? 0]),
    ) as Record<OrderBucket, number>;
    return dto;
  }

  static get labels(): Record<OrderBucket, string> {
    return ORDER_BUCKET_LABELS;
  }
}

/** 「我的」页一次性出参：资料 + 资产 + 四桶，省掉三次请求 */
export class CustomerOverviewDto {
  @ApiProperty({ description: '顾客资料' })
  profile!: CustomerProfileDto;

  @ApiProperty({ description: '当前商户的会员资产；未指定商户时为 null' })
  member!: MemberAssetDto | null;

  @ApiProperty({ description: '订单四桶计数' })
  orderCount!: CustomerOrderCountDto;
}

/** 积分流水一行 */
export class PointLogDto {
  @ApiProperty({ description: '积分变动（正负）' })
  pointChange!: number;

  @ApiProperty({ description: '变动后余额' })
  pointAfter!: number;

  @ApiProperty({ description: '原因文案' })
  reason!: string;

  @ApiPropertyOptional({ description: '关联订单号' })
  orderNo!: string | null;

  @ApiProperty({ description: '时间' })
  createdAt!: Date;
}
