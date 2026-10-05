import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 每页最大条数，防止一次性拉取过多数据 */
export const MAX_PAGE_SIZE = 100;

/**
 * 通用分页查询 DTO（见 CODEBUDDY.md 9：分页请求 page / pageSize）。
 * 业务查询 DTO 继承本类即可复用分页能力。
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', example: 1, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 最小为 1' })
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    description: '每页条数',
    example: 10,
    default: 10,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize 最大为 ${MAX_PAGE_SIZE}` })
  @IsOptional()
  pageSize: number = 10;

  /** 供 TypeORM skip 使用的偏移量 */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }
}
