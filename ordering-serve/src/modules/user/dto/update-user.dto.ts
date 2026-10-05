import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Permission } from '../../../shared/enums/permission.enum';
import { Role } from '../../../shared/enums/role.enum';

/**
 * 编辑账号入参。
 * 不含 username / password：用户名不可改，密码走独立的「重置密码」接口。
 *
 * ⚠️ 平台端对商家账号只允许改 `status`（封禁 / 解封），其余字段与 `permissions`
 * 由 UserService 按「谁在改谁的账号」逐条拒绝，不要在这里加白名单式放行。
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '姓名 / 昵称', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '姓名最长 32 个字符' })
  nickname?: string;

  @ApiPropertyOptional({ description: '手机号', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号最长 20 个字符' })
  phone?: string;

  @ApiPropertyOptional({ description: '角色', enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'role 取值不合法' })
  role?: Role;

  @ApiPropertyOptional({ description: '所属门店 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiPropertyOptional({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  @IsOptional()
  @IsEnum(CommonStatus, { message: 'status 只能是 0（禁用）或 1（启用）' })
  status?: CommonStatus;

  @ApiPropertyOptional({
    description: '授权权限点清单（仅平台管理员可写给平台运营专员）',
    enum: Permission,
    isArray: true,
  })
  @IsOptional()
  @IsArray({ message: 'permissions 需为数组' })
  @IsEnum(Permission, { each: true, message: 'permissions 含非法权限点' })
  permissions?: Permission[];
}
