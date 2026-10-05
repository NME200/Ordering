import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../shared/enums/permission.enum';

export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * 声明访问接口所需的权限点（满足其一即可）。
 *
 * 权限点与前端菜单 / 按钮共用同一套标识（见 shared/constants/permission-map.ts）。
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
