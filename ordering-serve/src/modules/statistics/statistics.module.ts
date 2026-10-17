import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customer/entities/customer.entity';
import { MemberProfile } from '../customer/entities/member-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { Payment } from '../payment/entities/payment.entity';
import { Store } from '../store/entities/store.entity';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

/**
 * 统计模块（数据大屏）。
 *
 * 只读，且刻意**直接注入各业务实体仓储**而不是 import 那些业务模块：
 * 聚合查询要跨 order / payment / customer / merchant 四张表做 GROUP BY，
 * 逐个模块开「给我算一下」的口子会把每个业务模块都拖进统计的形状里，
 * 而这里没有任何写操作，读同一份表不存在一致性风险。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Payment, Store, Merchant, Customer, MemberProfile])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
