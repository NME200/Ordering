import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CreateSpecGroupDto } from './create-spec-group.dto';
import { MAX_SPEC_OPTIONS, SpecOptionItemDto } from './spec-option-item.dto';

/**
 * 编辑规格组入参。
 *
 * - 刻意剔除 merchantId：规格组不允许跨租户迁移；
 * - `options` 为**整体覆盖**语义：带 id 的更新、不带 id 的新增、
 *   未出现在数组中的已有选项会被删除（软删除，保留历史引用）。
 */
export class UpdateSpecGroupDto extends PartialType(
  OmitType(CreateSpecGroupDto, ['merchantId', 'options']),
) {
  @ApiPropertyOptional({
    description: `规格项列表（整体覆盖语义，1 ~ ${MAX_SPEC_OPTIONS} 项；不传则保持原有选项不变）`,
    type: [SpecOptionItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'options 必须为数组' })
  @ArrayMinSize(1, { message: '规格组至少需要 1 个规格项' })
  @ArrayMaxSize(MAX_SPEC_OPTIONS, { message: `一个规格组最多 ${MAX_SPEC_OPTIONS} 个规格项` })
  @ValidateNested({ each: true })
  @Type(() => SpecOptionItemDto)
  options?: SpecOptionItemDto[];
}
