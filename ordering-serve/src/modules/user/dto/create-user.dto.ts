import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Permission } from '../../../shared/enums/permission.enum';
import { Role } from '../../../shared/enums/role.enum';

/**
 * 新增账号入参。
 *
 * 刻意没有 merchantId 字段：商家账号一律落在操作者自己的商户里（取自 Token），
 * 平台侧账号本就无租户归属 —— 「由平台为某个商户开通员工」这条路径已经不存在了。
 */
export class CreateUserDto {
  @ApiPropertyOptional({
    description: '所属门店 ID（门店管理员 / 收银员必填，仅商户侧账号需要）',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;

  @ApiProperty({ description: '登录用户名（全平台唯一）', example: 'cashier01', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(32, { message: '用户名最长 32 个字符' })
  username!: string;

  @ApiProperty({ description: '初始密码', example: 'Abc123456', minLength: 6, maxLength: 32 })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最长 32 位' })
  password!: string;

  @ApiProperty({ description: '姓名 / 昵称', example: '李四', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(32, { message: '姓名最长 32 个字符' })
  nickname!: string;

  @ApiPropertyOptional({ description: '手机号', example: '13900000000', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号最长 20 个字符' })
  phone?: string;

  @ApiProperty({ description: '角色', enum: Role, example: Role.CASHIER })
  @IsEnum(Role, { message: 'role 取值不合法' })
  role!: Role;

  /**
   * 仅平台运营专员需要：平台管理员逐项勾选的能力清单。
   * 是否越界由服务端按可授权白名单校验，不信任前端给的清单。
   */
  @ApiPropertyOptional({
    description: '授权权限点清单（仅平台运营专员有意义）',
    enum: Permission,
    isArray: true,
  })
  @IsOptional()
  @IsArray({ message: 'permissions 需为数组' })
  @IsEnum(Permission, { each: true, message: 'permissions 含非法权限点' })
  permissions?: Permission[];
}
