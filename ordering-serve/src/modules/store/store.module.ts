import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/entities/order.entity';
import { MiniappModule } from '../miniapp/miniapp.module';
import { Store } from './entities/store.entity';
import { StoreTable } from './entities/store-table.entity';
import { StoreTableQrcode } from './entities/store-table-qrcode.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { StoreTableService } from './store-table.service';
import { StoreTableQrcodeService } from './store-table-qrcode.service';

/**
 * 门店模块。
 * 导出 StoreService，供员工模块校验门店归属；导出 StoreTableService，
 * 供下单链路校验「扫码带出来的桌号在本店是不是还在用」。
 *
 * 只引入 Order **实体**（不引 OrderModule，避免模块互相引用成环）：
 * 删店前要数该门店的订单，见 `StoreService.remove`。
 *
 * 依赖 MiniappModule 只为拿平台凭据 —— 桌码由商家自己生成，但调微信接口用的
 * 是平台那一份 AppID / AppSecret。方向是 store → miniapp，miniapp 不认识 store。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Store, StoreTable, StoreTableQrcode, Order]),
    MiniappModule,
  ],
  controllers: [StoreController],
  providers: [StoreService, StoreTableService, StoreTableQrcodeService],
  exports: [StoreService, StoreTableService],
})
export class StoreModule {}
