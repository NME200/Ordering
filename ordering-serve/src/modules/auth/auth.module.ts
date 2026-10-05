import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MerchantModule } from '../merchant/merchant.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * 认证模块。
 *
 * 依赖 UserModule（账号查询）与 MerchantModule（登录时校验商户状态）。
 */
@Module({
  imports: [
    UserModule,
    MerchantModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          // @nestjs/jwt 的 expiresIn 类型是 `number | StringValue`（ms 的模板字面量类型），
          // 而配置读出来是普通 string，这里做一次显式转换。
          expiresIn: config.getOrThrow<string>('jwt.expiresIn') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
