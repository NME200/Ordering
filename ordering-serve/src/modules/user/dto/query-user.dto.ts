import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AccountKind } from '../../../shared/enums/account-kind.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Role } from '../../../shared/enums/role.enum';

/** 账号列表查询入参 */
export class QueryUserDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '所属商户 ID（仅平台侧角色可指定）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;

  @ApiPropertyOptional({ description: '所属门店 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiPropertyOptional({ description: '按用户名 / 姓名模糊搜索', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  keyword?: string;

  @ApiPropertyOptional({ description: '角色筛选', enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'role 取值不合法' })
  role?: Role;

  /**
   * 账户分类筛选，供平台端「平台账户 / 商家账户」两个页签使用。
   * 分类到角色的映射只在服务端展开（见 UserService.paginate），前端不碰角色清单。
   */
  @ApiPropertyOptional({ description: '账户分类筛选', enum: AccountKind })
  @IsOptional()
  @IsEnum(AccountKind, { message: 'accountKind 取值不合法' })
  accountKind?: AccountKind;

  @ApiPropertyOptional({ description: '状态筛选：0 禁用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;
}
