import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { BusinessException } from '../exceptions/business.exception';
import { AuthUser } from '../interfaces/auth-user.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 全局 JWT 登录守卫。
 *
 * 默认所有接口都需要登录；用 @Public() 显式放行。
 * 校验通过后，用户上下文会挂到 request.user，供 @CurrentUser() 使用。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw err instanceof BusinessException ? err : BusinessException.unauthorized();
    }
    return user;
  }
}
