import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { CustomerModule } from '../customer/customer.module';
import { Customer } from '../customer/entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { ReviewController, ReviewCustomerController } from './review.controller';
import { ReviewService } from './review.service';
import { Review } from './entities/review.entity';

/**
 * 评价模块。
 *
 * 依赖 CustomerModule 只为拿 MemberService（评价赠分）——
 * 积分变动必须由资产侧统一记账，评价服务自己 `point += 5` 是最典型的重复实现。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Review, Order, Customer]), CustomerAuthModule, CustomerModule],
  controllers: [ReviewCustomerController, ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
