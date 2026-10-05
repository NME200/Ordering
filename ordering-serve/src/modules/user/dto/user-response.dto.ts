import { ApiProperty } from '@nestjs/swagger';
import { AccountBanSource } from '../../../shared/enums/account-ban-source.enum';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Permission } from '../../../shared/enums/permission.enum';
import { ROLE_LABELS, Role } from '../../../shared/enums/role.enum';
import { User } from '../entities/user.entity';

/** 账号出参 DTO（不含密码等敏感字段） */
export class UserResponseDto {
  @ApiProperty({ description: '账号 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID；平台侧账号为 null', nullable: true, example: 1 })
  merchantId!: number | null;

  @ApiProperty({ description: '所属门店 ID', nullable: true, example: 1 })
  storeId!: number | null;

  @ApiProperty({ description: '登录用户名', example: 'cashier01' })
  username!: string;

  @ApiProperty({ description: '姓名 / 昵称', example: '李四' })
  nickname!: string;

  @ApiProperty({ description: '手机号', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: '角色标识', enum: Role, example: Role.CASHIER })
  role!: Role;

  @ApiProperty({ description: '角色名称', example: '收银员' })
  roleLabel!: string;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  /**
   * 封禁发起方；启用状态下为 null。
   * 前端据此决定封禁开关是否可操作，避免商家对平台的封禁反复点击。
   */
  @ApiProperty({
    description: '封禁发起方：platform / merchant；启用时为 null',
    enum: AccountBanSource,
    nullable: true,
  })
  bannedBy!: AccountBanSource | null;

  /**
   * 账号级授权清单；null 表示该账号沿用角色默认权限。
   * 供平台端「授权」弹窗回填勾选状态，非平台运营专员恒为 null。
   */
  @ApiProperty({
    description: '账号级授权清单；null 表示沿用角色默认权限',
    enum: Permission,
    isArray: true,
    nullable: true,
  })
  permissions!: Permission[] | null;

  @ApiProperty({ description: '最后登录时间', nullable: true, type: String, format: 'date-time' })
  lastLoginAt!: Date | null;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = entity.id;
    dto.merchantId = entity.merchantId;
    dto.storeId = entity.storeId;
    dto.username = entity.username;
    dto.nickname = entity.nickname;
    dto.phone = entity.phone;
    dto.role = entity.role;
    dto.roleLabel = ROLE_LABELS[entity.role];
    dto.permissions = entity.permissions;
    dto.status = entity.status;
    dto.bannedBy = entity.bannedBy;
    dto.lastLoginAt = entity.lastLoginAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
