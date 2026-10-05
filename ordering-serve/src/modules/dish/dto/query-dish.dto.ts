import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DishStatus } from '../../../shared/enums/dish-status.enum';

/** 菜品列表查询入参 */
export class QueryDishDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '所属商户 ID（仅平台管理员可指定）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '所属分类 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoryId 必须为整数' })
  @Min(1, { message: 'categoryId 最小为 1' })
  categoryId?: number;

  /**
   * 按门店查看：决定「店专属菜是否可见」与「有效价按哪家店算」。
   * 门店绑定角色（门店管理员 / 收银员）会被服务端强制改写为本店，传值无效。
   */
  @ApiPropertyOptional({ description: '门店 ID（门店绑定角色强制为本店）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiPropertyOptional({ description: '按菜品名称模糊搜索', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @ApiPropertyOptional({ description: '状态筛选：0 下架 / 1 上架', enum: DishStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(DishStatus, { message: 'status 只能是 0（下架）或 1（上架）' })
  status?: DishStatus;

  @ApiPropertyOptional({ description: '是否只查推荐菜（true / false）' })
  @IsOptional()
  // query 参数都是字符串，不能用 @Type(() => Boolean)（Boolean("false") === true）
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 'true' || value === '1';
  })
  @IsBoolean({ message: 'isRecommend 必须为布尔值' })
  isRecommend?: boolean;
}
