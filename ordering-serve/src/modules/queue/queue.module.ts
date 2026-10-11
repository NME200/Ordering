import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { MerchantModule } from '../merchant/merchant.module';
import { Store } from '../store/entities/store.entity';
import { QueueController, QueueCustomerController } from './queue.controller';
import { QueueService } from './queue.service';
import { Queue } from './entities/queue.entity';

/**
 * 排队叫号模块。
 *
 * 门店可用性判断与下单同源（商户未禁用未过期 + 门店启用 + 营业中）：
 * 打烊的店不该还能取号，否则顾客拿着号到店却发现没开门。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Queue, Store]), CustomerAuthModule, MerchantModule],
  controllers: [QueueCustomerController, QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
