import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentModule } from '../payment/payment.module';
import { PaymentConfig } from './entities/payment-config.entity';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';

/**
 * 支付配置模块。
 *
 * 依赖方向刻意做成单向：本模块注入 PaymentProviderRegistry 触发热加载，
 * 而 PaymentModule **不**反向 import 本模块 —— 注册表直接注入 PaymentConfig 仓储读配置
 * （与「PaymentModule 直接注入 Order 仓储以避免循环依赖」同一个手法）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentConfig]), PaymentModule],
  controllers: [PaymentConfigController],
  providers: [PaymentConfigService],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
