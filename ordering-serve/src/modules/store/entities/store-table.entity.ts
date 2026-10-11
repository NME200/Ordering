import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 门店台位（桌号）。
 *
 * 桌号从「顾客手填」改成「扫桌上的码带出来」之后，它必须是可枚举、可校验的数据：
 * 下单时服务端要能回答「A12 这张桌在本店存不存在、还在不在用」——
 * 码贴错桌、换桌布后旧码没撕，都会把餐端到别桌去。
 *
 * 两点刻意的选择：
 * - **不带 merchant_id**：台位永远跟着门店走，越权在「这个 storeId 你能不能碰」
 *   那一层由门店范围校验挡掉（与 store_dishes 同构）；
 * - **桌号不建数据库唯一索引**：按本项目约定，软删后名称要能复用（撕码换新的同名桌），
 *   判重放在 Service 层。订单号 / 幂等令牌那类才需要 DB 级唯一。
 */
@Entity('store_tables')
@Index('idx_store_table_store', ['storeId'])
export class StoreTable extends BaseEntity {
  @Column({
    name: 'store_id',
    type: 'bigint',
    transformer: bigintTransformer,
    comment: '所属门店 ID',
  })
  storeId!: number;

  @Column({
    name: 'table_no',
    type: 'varchar',
    length: 16,
    comment: '桌号，与 orders.table_no 同口径，扫码时从二维码 scene 带出',
  })
  tableNo!: string;

  @Column({
    type: 'varchar',
    length: 24,
    nullable: true,
    comment: '区域 / 包厢分组，只用于后台归类与打印台面牌时的排序',
  })
  area!: string | null;

  @Column({
    type: 'tinyint',
    default: CommonStatus.ENABLED,
    comment: '0 停用（撤桌，扫码进来会被拒）/ 1 启用',
  })
  status!: CommonStatus;

  @Column({ type: 'int', default: 0, comment: '排序，小的在前' })
  sort!: number;
}
