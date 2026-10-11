import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerTokenService } from './customer-token.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { OptionalCustomerGuard } from './guards/optional-customer.guard';

/**
 * 顾客鉴权模块。
 *
 * 单独成模块（而不是并进 CustomerModule）是为了打断循环依赖：
 * 订单模块要 `OptionalCustomerGuard`（下单时顺带记录归属），
 * 顾客模块又要订单服务（「我的订单」列表）。
 * 把令牌与守卫抽出来，两边都只依赖它，环就断了。
 *
 * 密钥与员工侧同源（同一 `jwt.secret`），靠载荷里的 `kind` 区分主体，
 * 因此两侧都必须校验这个字段 —— 见 CustomerTokenService 的说明。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('jwt.expiresIn') as unknown as number,
        },
      }),
    }),
  ],
  providers: [CustomerTokenService, CustomerAuthGuard, OptionalCustomerGuard],
  exports: [CustomerTokenService, CustomerAuthGuard, OptionalCustomerGuard],
})
export class CustomerAuthModule {}
