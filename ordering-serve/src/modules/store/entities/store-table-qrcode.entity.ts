import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../shared/utils/transformers';

/**
 * 门店桌码（一桌一码）。
 *
 * 归属门店，所以放在 store 模块、跟着门店的权限走：商家管理员在自己后台生成，
 * 平台不替商家出码。`storeId + tableNo` 唯一 —— 台面牌印出去之后桌号不能变，
 * 变了那张码就废了，因此重新生成是覆盖同一行，不留历史。
 *
 * 图片以 base64 直接入库（PNG 约 30~60 KB / 张）：本项目没有对象存储与静态目录，
 * 一家店几十张桌也就几 MB，够用；真到上千家门店再换 OSS，读取路径不用动。
 */
@Entity('store_table_qrcodes')
@Unique('uk_store_table_qrcode', ['storeId', 'tableNo'])
@Index('idx_store_table_qrcode_store', ['storeId'])
export class StoreTableQrcode extends BaseEntity {
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
    comment: '桌号（生成时的快照，与 store_tables.table_no 同口径）',
  })
  tableNo!: string;

  @Column({ type: 'varchar', length: 64, comment: '实际写进码里的 scene' })
  scene!: string;

  @Column({ type: 'varchar', length: 128, comment: '扫码落地页' })
  page!: string;

  /**
   * 这张码指向的小程序版本。
   *
   * 必须留在行上：印出去的台面牌不会自己改版本，未发布时出的 trial 码，
   * 发布之后扫开仍是体验版 —— 没有这一列，谁也不知道桌上那张码是哪种。
   */
  @Column({
    name: 'env_version',
    type: 'varchar',
    length: 16,
    default: 'release',
    comment: 'release 正式版 / trial 体验版 / develop 开发版',
  })
  envVersion!: string;

  /**
   * 图片的 base64。
   *
   * 必须是 mediumtext：微信出的这张码约 50~60 KB 原始字节，转 base64 会涨到 ~72 KB，
   * 而 MySQL 的 TEXT 上限是 65,535 **字节** —— 用 text 会在保存时直接「数据操作失败」。
   */
  @Column({
    name: 'image_base64',
    type: 'mediumtext',
    comment: '图片 base64（不带 data: 前缀；实测微信回的是 JPEG）',
  })
  imageBase64!: string;

  @Column({
    name: 'generated_by_name',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '生成人',
  })
  generatedByName!: string | null;
}
