import { ApiProperty } from '@nestjs/swagger';
import { PaginatedData } from '../interfaces/api-response.interface';

/**
 * 通用分页响应 DTO（见 CODEBUDDY.md 9：`{ list, total, page, pageSize }`）。
 *
 * 用 `PaginatedDto.from(...)` 从查询结果构造，避免各 Service 手写分页结构。
 */
export class PaginatedDto<T> implements PaginatedData<T> {
  @ApiProperty({ description: '当前页数据列表', isArray: true })
  list: T[];

  @ApiProperty({ description: '总条数', example: 100 })
  total: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page: number;

  @ApiProperty({ description: '每页条数', example: 10 })
  pageSize: number;

  constructor(list: T[], total: number, page: number, pageSize: number) {
    this.list = list;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }

  /** 从 TypeORM 的 `findAndCount` 结果快速构造 */
  static from<T>(result: PaginatedData<T>): PaginatedDto<T> {
    return new PaginatedDto<T>(result.list, result.total, result.page, result.pageSize);
  }
}
