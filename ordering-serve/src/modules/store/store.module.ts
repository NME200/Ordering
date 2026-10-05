import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/entities/order.entity';
import { Store } from './entities/store.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

/**
 * 门店模块。
 * 导出 StoreService，供员工模块校验门店归属。
 *
 * 只引入 Order **实体**（不引 OrderModule，避免模块互相引用成环）：
 * 删店前要数该门店的订单，见 `StoreService.remove`。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Store, Order])],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
