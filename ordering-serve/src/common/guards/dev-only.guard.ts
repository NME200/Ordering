import { CanActivate, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 仅非生产环境放行的守卫。
 *
 * 用于联调专用接口（如「模拟支付成功」）：这类接口的能力等价于替渠道发一条
 * 已验签的回调，泄漏到生产就是后门，因此生产环境一律按「资源不存在」处理，
 * 不暴露接口是否存在。
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (this.configService.getOrThrow<boolean>('app.isProduction')) {
      throw BusinessException.notFound(ErrorCode.NOT_FOUND, '接口不存在');
    }
    return true;
  }
}
