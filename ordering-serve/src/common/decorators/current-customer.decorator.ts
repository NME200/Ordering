import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthCustomer } from '../interfaces/auth-customer.interface';

/**
 * 注入当前登录**顾客**上下文。
 *
 * 与 @CurrentUser()（员工）分开，是因为两类主体在同一请求里可能同时不存在：
 * C 端下单是公开接口，带了顾客令牌就归属到账号，没带也照样能下单。
 */
export const CurrentCustomer = createParamDecorator(
  (field: keyof AuthCustomer | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ customer?: AuthCustomer }>();
    const customer = request.customer;
    if (!customer) {
      return undefined;
    }
    return field ? customer[field] : customer;
  },
);
