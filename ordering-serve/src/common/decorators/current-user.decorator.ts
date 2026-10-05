import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * 注入当前登录用户上下文。
 *
 * 用法：
 * ```ts
 * findAll(@CurrentUser() user: AuthUser) {}          // 取完整上下文
 * findAll(@CurrentUser('merchantId') id: number) {}  // 只取某个字段
 * ```
 *
 * 注意：`merchantId` 来自服务端解析的 Token，绝不接受前端传入（见 CODEBUDDY.md 8.1）。
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return field ? user[field] : user;
  },
);
