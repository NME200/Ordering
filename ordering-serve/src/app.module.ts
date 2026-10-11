import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DatabaseModule } from './modules/database/database.module';
import { DishCategoryModule } from './modules/dish-category/dish-category.module';
import { DishModule } from './modules/dish/dish.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { MiniappModule } from './modules/miniapp/miniapp.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentConfigModule } from './modules/payment-config/payment-config.module';
import { PopupModule } from './modules/popup/popup.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PublicModule } from './modules/public/public.module';
import { QueueModule } from './modules/queue/queue.module';
import { RedisModule } from './modules/redis/redis.module';
import { ReviewModule } from './modules/review/review.module';
import { ServiceModule } from './modules/service/service.module';
import { SpecGroupModule } from './modules/spec-group/spec-group.module';
import { StoreModule } from './modules/store/store.module';
import { StoreDishModule } from './modules/store-dish/store-dish.module';
import { UserModule } from './modules/user/user.module';

/**
 * 根模块。
 *
 * 全局能力统一在这里注册，业务模块只关心自己的领域：
 * - 守卫：登录校验 → 角色校验 → 权限点校验（顺序即注册顺序）；
 * - 拦截器：请求日志 → 统一响应包装；
 * - 过滤器：全局异常 → 统一错误结构。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    MerchantModule,
    StoreModule,
    UserModule,
    DishCategoryModule,
    SpecGroupModule,
    DishModule,
    StoreDishModule,
    OrderModule,
    PaymentModule,
    PaymentConfigModule,
    PublicModule,
    PopupModule,
    AppConfigModule,
    // 顾客域：账号 / 地址 / 会员资产 + 券 / 评价 / 发票 / 客服 / 叫号
    CouponModule,
    CustomerModule,
    ReviewModule,
    InvoiceModule,
    ServiceModule,
    QueueModule,

    // 小程序配置：凭据 / 扫码规则 / 桌号二维码（与支付配置同级，只归平台管理员）
    MiniappModule,
  ],
  controllers: [AppController],
  providers: [
    // 顺序有意义：限流跑在最前面，被刷时不必先做 Token 校验
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
