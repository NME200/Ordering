import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAuthModule } from '../customer/customer-auth.module';
import { Order } from '../order/entities/order.entity';
import { Store } from '../store/entities/store.entity';
import { InvoiceController, InvoiceCustomerController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceApplication } from './entities/invoice-application.entity';
import { InvoiceTitle } from './entities/invoice-title.entity';

/**
 * 发票模块。
 *
 * 只读 orders / stores 两张表来判断「哪些单可开票」，不依赖 OrderModule ——
 * 开票是订单的下游，反向依赖会把订单模块拖进新的循环。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([InvoiceTitle, InvoiceApplication, Order, Store]),
    CustomerAuthModule,
  ],
  controllers: [InvoiceCustomerController, InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
