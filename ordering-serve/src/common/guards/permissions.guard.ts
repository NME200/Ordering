import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Permission } from '../../shared/enums/permission.enum';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { BusinessException } from '../exceptions/business.exception';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * 权限点守卫：校验 @Permissions() 声明的权限（满足其一即可）。
 *
 * 权限点取自 `request.user.permissions` —— 由 JwtStrategy 每次请求从数据库现值
 * 解析出的**有效权限**（角色默认，或平台管理员对该账号的显式授权）。
 * 接口鉴权是**最终边界**，前端隐藏菜单 / 按钮只作体验优化。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) {
      throw BusinessException.unauthorized();
    }

    const allowed = requiredPermissions.some((permission) =>
      user.permissions.includes(permission),
    );
    if (!allowed) {
      throw BusinessException.forbidden('缺少操作权限');
    }
    return true;
  }
}
