import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';

/**
 * 台位的新建 / 修改。
 *
 * 门店 ID 走路由参数（`/stores/:id/tables`），不在这里收 ——
 * 让前端传 storeId 等于给「替别的门店建桌」留口子。
 */
export class UpsertStoreTableDto {
  @ApiProperty({ description: '桌号，如 A12', maxLength: 16 })
  @IsString()
  @MaxLength(16, { message: '桌号最长 16 个字符' })
  tableNo!: string;

  @ApiPropertyOptional({ description: '区域 / 包厢分组', maxLength: 24 })
  @IsOptional()
  @IsString()
  @MaxLength(24, { message: '区域名最长 24 个字符' })
  area?: string;

  @ApiPropertyOptional({ description: '状态：1 启用 / 0 停用', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsIn([CommonStatus.ENABLED, CommonStatus.DISABLED], { message: 'status 只能是 0 或 1' })
  status?: CommonStatus;

  @ApiPropertyOptional({ description: '排序，小的在前', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sort 必须为整数' })
  @Min(0, { message: 'sort 不能为负' })
  @Max(9999, { message: 'sort 最大 9999' })
  sort?: number;
}

/** 台位行 */
export class StoreTableResponseDto {
  @ApiProperty({ description: '台位 ID' })
  id!: number;

  @ApiProperty({ description: '所属门店 ID' })
  storeId!: number;

  @ApiProperty({ description: '桌号' })
  tableNo!: string;

  @ApiProperty({ description: '区域 / 包厢分组；未填为 null', nullable: true })
  area!: string | null;

  @ApiProperty({ description: '状态：1 启用 / 0 停用' })
  status!: CommonStatus;

  @ApiProperty({ description: '排序' })
  sort!: number;

  static from(table: {
    id: number;
    storeId: number;
    tableNo: string;
    area: string | null;
    status: CommonStatus;
    sort: number;
  }): StoreTableResponseDto {
    const dto = new StoreTableResponseDto();
    dto.id = table.id;
    dto.storeId = table.storeId;
    dto.tableNo = table.tableNo;
    dto.area = table.area;
    dto.status = table.status;
    dto.sort = table.sort;
    return dto;
  }
}
