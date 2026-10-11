import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { Customer } from '../customer/entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { ServiceCustomerController, ServiceStaffController } from './service.controller';
import { ServiceService } from './service.service';
import { ServiceMessage } from './entities/service-message.entity';
import { ServiceSession } from './entities/service-session.entity';

/**
 * 在线客服模块。
 *
 * 消息表只增不改（客服不能编辑已发出的话），会话表承担所有冗余展示字段，
 * 这样会话列表不用 JOIN 消息表就能出，一屏 20 条会话是 1 次查询而不是 21 次。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceSession, ServiceMessage, Customer, Order]),
    CustomerAuthModule,
  ],
  controllers: [ServiceCustomerController, ServiceStaffController],
  providers: [ServiceService],
  exports: [ServiceService],
})
export class ServiceModule {}
