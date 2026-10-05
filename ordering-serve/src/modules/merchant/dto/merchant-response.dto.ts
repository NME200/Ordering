import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Merchant } from '../entities/merchant.entity';

/**
 * 商户出参 DTO。
 * 不直接把 Entity 暴露给前端（见 CODEBUDDY.md 5.2）。
 */
export class MerchantResponseDto {
  @ApiProperty({ description: '商户 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '商户名称', example: '示例餐饮有限公司' })
  name!: string;

  @ApiProperty({ description: '联系人', nullable: true, example: '张三' })
  contactName!: string | null;

  @ApiProperty({ description: '联系电话', nullable: true, example: '13800000000' })
  contactPhone!: string | null;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus, example: CommonStatus.ENABLED })
  status!: CommonStatus;

  @ApiProperty({ description: '服务到期时间', nullable: true, type: String, format: 'date-time' })
  expireAt!: Date | null;

  @ApiProperty({ description: '备注', nullable: true })
  remark!: string | null;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: Merchant): MerchantResponseDto {
    const dto = new MerchantResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.contactName = entity.contactName;
    dto.contactPhone = entity.contactPhone;
    dto.status = entity.status;
    dto.expireAt = entity.expireAt;
    dto.remark = entity.remark;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
