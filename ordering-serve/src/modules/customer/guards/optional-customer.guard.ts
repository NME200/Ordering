import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { CustomerTokenService } from '../customer-token.service';

/**
 * 顾客登录守卫（可选）。
 *
 * 用在「有令牌就归属到账号、没令牌也照样放行」的公开链路上 —— 目前只有下单。
 * 令牌无效时**只记日志不报错**：顾客换了手机重装、本地 visitorKey 变了但缓存里
 * 还留着旧令牌，这种情况下必须让他继续下单，而不是弹一句「登录已失效」。
 * 订单落不进账号是可以在「我的订单」里被发现的降级，下单被拦是不可见的降级。
 */
@Injectable()
export class OptionalCustomerGuard implements CanActivate {
  private readonly logger = new Logger(OptionalCustomerGuard.name);

  constructor(private readonly tokens: CustomerTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { customer?: unknown }>();
    const token = this.tokens.extractBearer(request.headers.authorization);
    if (!token) {
      return true;
    }
    try {
      request.customer = await this.tokens.verify(token);
    } catch (error) {
      this.logger.debug(`下单请求携带的顾客令牌无效，按游客下单处理：${(error as Error).message}`);
    }
    return true;
  }
}
