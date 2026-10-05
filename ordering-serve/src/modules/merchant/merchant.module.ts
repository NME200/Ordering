import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { Merchant } from './entities/merchant.entity';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';

/**
 * 商户模块。
 * 导出 MerchantService，供 AuthModule 在登录时校验商户状态。
 * 依赖 UserModule：新增商户时同事务开通其首个商家管理员。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Merchant]), UserModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
