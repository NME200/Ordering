import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { SPEC_TYPE_LABELS, SpecType } from '../../../shared/enums/spec-type.enum';
import { SpecOption } from '../entities/spec-option.entity';
import { SpecGroup } from '../entities/spec-group.entity';

/** 规格项出参 DTO */
export class SpecOptionResponseDto {
  @ApiProperty({ description: '规格项 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '选项名称', example: '大杯' })
  name!: string;

  @ApiProperty({ description: '价格增量（分），可为负', example: 200 })
  priceDiff!: number;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  static from(entity: SpecOption): SpecOptionResponseDto {
    const dto = new SpecOptionResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.priceDiff = entity.priceDiff;
    dto.sort = entity.sort;
    dto.status = entity.status;
    return dto;
  }
}

/** 规格组出参 DTO（含组内规格项） */
export class SpecGroupResponseDto {
  @ApiProperty({ description: '规格组 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '规格组名称', example: '杯型' })
  name!: string;

  @ApiProperty({ description: '选购方式：1 单选 / 2 多选', enum: SpecType })
  type!: SpecType;

  @ApiProperty({ description: '选购方式名称', example: '单选' })
  typeLabel!: string;

  @ApiProperty({ description: '是否必选', example: false })
  isRequired!: boolean;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({ description: '组内规格项列表', type: [SpecOptionResponseDto] })
  options!: SpecOptionResponseDto[];

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: SpecGroup, options: SpecOption[] = []): SpecGroupResponseDto {
    const dto = new SpecGroupResponseDto();
    dto.id = entity.id;
    dto.merchantId = entity.merchantId;
    dto.name = entity.name;
    dto.type = entity.type;
    dto.typeLabel = SPEC_TYPE_LABELS[entity.type];
    dto.isRequired = entity.isRequired;
    dto.sort = entity.sort;
    dto.status = entity.status;
    dto.options = options.map((option) => SpecOptionResponseDto.from(option));
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
