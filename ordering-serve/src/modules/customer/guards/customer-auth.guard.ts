import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CustomerTokenService } from '../customer-token.service';

/**
 * 顾客登录守卫（强制）。
 *
 * 必须与 `@Public()` 成对出现：全局 `JwtAuthGuard` 排在前面且只认员工令牌，
 * 不给路由标 @Public() 的话，顾客请求会先被员工守卫拦成 401。
 * @Public() 在这里**不是**「谁都能进」，而是「把鉴权交给本守卫」。
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly tokens: CustomerTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { customer?: unknown }>();
    const token = this.tokens.extractBearer(request.headers.authorization);
    request.customer = await this.tokens.verify(token);
    return true;
  }
}
