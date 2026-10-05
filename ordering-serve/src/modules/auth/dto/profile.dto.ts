import { ApiProperty } from '@nestjs/swagger';
import { getEffectivePermissions } from '../../../shared/constants/permission-map';
import { getPortalsByRole } from '../../../shared/constants/portal-map';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { Permission } from '../../../shared/enums/permission.enum';
import { Portal } from '../../../shared/enums/portal.enum';
import { ROLE_LABELS, Role } from '../../../shared/enums/role.enum';
import { User } from '../../user/entities/user.entity';

/**
 * 当前登录账号信息。
 *
 * permissions 供前端做菜单 / 按钮级展示控制；
 * **真正的安全边界在服务端接口鉴权**（见 CODEBUDDY.md 8.2）。
 */
export class ProfileDto {
  @ApiProperty({ description: '账号 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '登录用户名', example: 'admin' })
  username!: string;

  @ApiProperty({ description: '姓名 / 昵称', example: '平台管理员' })
  nickname!: string;

  @ApiProperty({ description: '手机号', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: '角色标识', enum: Role })
  role!: Role;

  @ApiProperty({ description: '角色名称', example: '平台管理员' })
  roleLabel!: string;

  @ApiProperty({ description: '所属商户 ID；平台管理员为 null', nullable: true })
  merchantId!: number | null;

  @ApiProperty({ description: '所属门店 ID', nullable: true })
  storeId!: number | null;

  @ApiProperty({ description: '状态：0 禁用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({
    description: '有效权限点列表（角色默认，或平台管理员对该账号的显式授权）',
    type: [String],
    example: ['store:read'],
  })
  permissions!: Permission[];

  @ApiProperty({
    description: '该账号允许登录的客户端列表',
    type: [String],
    example: ['merchant', 'cashier'],
  })
  portals!: Portal[];

  static from(entity: User): ProfileDto {
    const dto = new ProfileDto();
    dto.id = entity.id;
    dto.username = entity.username;
    dto.nickname = entity.nickname;
    dto.phone = entity.phone;
    dto.role = entity.role;
    dto.roleLabel = ROLE_LABELS[entity.role];
    dto.merchantId = entity.merchantId;
    dto.storeId = entity.storeId;
    dto.status = entity.status;
    dto.permissions = getEffectivePermissions(entity.role, entity.permissions);
    dto.portals = getPortalsByRole(entity.role);
    return dto;
  }
}
