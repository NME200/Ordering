import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '../../shared/enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { BusinessException } from '../exceptions/business.exception';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * 角色守卫：校验 @Roles() 声明的角色。
 *
 * 在 JwtAuthGuard 之后执行，因此能确定 request.user 已存在。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) {
      throw BusinessException.unauthorized();
    }
    if (!requiredRoles.includes(user.role)) {
      throw BusinessException.forbidden('当前角色无权执行该操作');
    }
    return true;
  }
}
