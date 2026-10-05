import { ApiProperty } from '@nestjs/swagger';
import { AccountBanSource } from '../../../shared/enums/account-ban-source.enum';
import { BusinessStatus } from '../../../shared/enums/business-status.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Store } from '../entities/store.entity';

/** 门店出参 DTO */
export class StoreResponseDto {
  @ApiProperty({ description: '门店 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '门店名称', example: '人民路店' })
  name!: string;

  @ApiProperty({ description: '门店编码', nullable: true, example: 'S001' })
  code!: string | null;

  @ApiProperty({ description: '门店地址', nullable: true })
  address!: string | null;

  @ApiProperty({ description: '门店电话', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: '营业状态：0 打烊 / 1 营业中', enum: BusinessStatus })
  businessStatus!: BusinessStatus;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({
    description: '停用发起方：platform / merchant；启用时为 null',
    enum: AccountBanSource,
    nullable: true,
  })
  bannedBy!: AccountBanSource | null;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: Store): StoreResponseDto {
    const dto = new StoreResponseDto();
    dto.id = entity.id;
    dto.merchantId = entity.merchantId;
    dto.name = entity.name;
    dto.code = entity.code;
    dto.address = entity.address;
    dto.phone = entity.phone;
    dto.businessStatus = entity.businessStatus;
    dto.status = entity.status;
    dto.bannedBy = entity.bannedBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
