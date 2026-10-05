import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** C 端拉布局配置的入参 */
export class QueryAppConfigDto {
  @ApiPropertyOptional({
    description: '本地缓存的版本号；与服务端当前版本一致时只回 { unchanged: true }',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'v 必须为整数' })
  @Min(0, { message: 'v 不能为负' })
  v?: number;
}
