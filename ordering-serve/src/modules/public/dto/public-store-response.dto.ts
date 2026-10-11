import { ApiProperty } from '@nestjs/swagger';
import { BusinessStatus, BUSINESS_STATUS_LABELS } from '../../../shared/enums/business-status.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Store } from '../../store/entities/store.entity';

/**
 * C 端门店信息（只给顾客需要看的）。
 *
 * `merchantId` 是刻意放出来的：会员资产（积分 / 余额 / 等级）与券都按商户归属，
 * 顾客端必须知道「现在进的这家店属于哪个商户」才能去读自己的会员身份。
 * 它既不是密钥也不是内部编号 —— 门店名本身就能唯一指认品牌。
 */
export class PublicStoreResponseDto {
  @ApiProperty({ description: '门店 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID（会员资产与券的归属维度）', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '门店名称', example: '人民路店' })
  name!: string;

  @ApiProperty({ description: '门店地址', nullable: true })
  address!: string | null;

  @ApiProperty({ description: '门店电话', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: '门店 logo，未录入为 null（前端用店名首字兜底）', nullable: true })
  logo!: string | null;

  @ApiProperty({ description: '营业时间展示文案，未录入为 null', nullable: true, example: '09:00-21:00' })
  businessHours!: string | null;

  /**
   * 经纬度：给顾客端算「距您 320m」用。
   *
   * 距离在前端算而不是后端，是因为用户位置只在小程序那一侧有，
   * 把它传给匿名接口既多一次授权也多一条隐私链路；地址本来就是公开的。
   */
  @ApiProperty({ description: '纬度，未录入为 null', nullable: true })
  latitude!: number | null;

  @ApiProperty({ description: '经度，未录入为 null', nullable: true })
  longitude!: number | null;

  @ApiProperty({ description: '营业状态：0 打烊 / 1 营业中', enum: BusinessStatus })
  businessStatus!: BusinessStatus;

  @ApiProperty({ description: '营业状态名称', example: '营业中' })
  businessStatusLabel!: string;

  @ApiProperty({ description: '现在能不能下单（打烊为 false）', example: true })
  orderable!: boolean;

  @ApiProperty({ description: '不能下单时的提示文案', nullable: true })
  orderableHint!: string | null;

  static from(store: Store): PublicStoreResponseDto {
    const dto = new PublicStoreResponseDto();
    const open = store.businessStatus === BusinessStatus.OPEN;

    dto.id = store.id;
    dto.merchantId = store.merchantId;
    dto.name = store.name;
    dto.address = store.address;
    dto.phone = store.phone;
    dto.logo = store.logo;
    dto.businessHours = store.businessHours;
    dto.latitude = store.latitude ?? null;
    dto.longitude = store.longitude ?? null;
    dto.businessStatus = store.businessStatus;
    dto.businessStatusLabel = BUSINESS_STATUS_LABELS[store.businessStatus];
    dto.orderable = open && store.status === CommonStatus.ENABLED;
    dto.orderableHint = open ? null : '门店已打烊，暂不接单';
    return dto;
  }
}
