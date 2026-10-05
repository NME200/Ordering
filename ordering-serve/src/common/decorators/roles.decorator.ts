import { SetMetadata } from '@nestjs/common';
import { Role } from '../../shared/enums/role.enum';

export const ROLES_KEY = 'auth:roles';

/**
 * 声明访问接口所需的角色（满足其一即可）。
 *
 * 用于**终端级别**的粗粒度控制，例如「只有平台管理员能管理商户」。
 * 更细的粒度请配合 @Permissions() 使用。
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
