import { ApiProperty } from '@nestjs/swagger';
import { BusinessStatus, BUSINESS_STATUS_LABELS } from '../../../shared/enums/business-status.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Store } from '../../store/entities/store.entity';

/** C 端门店信息（只给顾客需要看的，不含商户 ID 等内部字段） */
export class PublicStoreResponseDto {
  @ApiProperty({ description: '门店 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '门店名称', example: '人民路店' })
  name!: string;

  @ApiProperty({ description: '门店地址', nullable: true })
  address!: string | null;

  @ApiProperty({ description: '门店电话', nullable: true })
  phone!: string | null;

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
    dto.name = store.name;
    dto.address = store.address;
    dto.phone = store.phone;
    dto.businessStatus = store.businessStatus;
    dto.businessStatusLabel = BUSINESS_STATUS_LABELS[store.businessStatus];
    dto.orderable = open && store.status === CommonStatus.ENABLED;
    dto.orderableHint = open ? null : '门店已打烊，暂不接单';
    return dto;
  }
}
