import { ApiProperty } from '@nestjs/swagger';

/**
 * 数据大屏的读模型。
 *
 * 一次请求回一整块屏要的全部数据，而不是让大屏每 10 秒打七个接口：
 * 屏是「一个时刻的快照」，分七个请求拿回来的数字根本不在同一时刻，
 * 折线图和概览卡对不上账时没人说得清是哪个准。
 *
 * 金额一律是**分**（与全项目一致），换算成元是前端展示层的事。
 */

/** 概览卡：今日口径的八个数 */
export class ScreenOverviewDto {
  @ApiProperty({ description: '今日实收（成功支付流水合计，分）', example: 128400 })
  revenueCent!: number;

  @ApiProperty({ description: '今日退款（分）', example: 3800 })
  refundCent!: number;

  @ApiProperty({ description: '今日下单数（含未支付与已取消）', example: 42 })
  orderCount!: number;

  @ApiProperty({ description: '今日支付成功单数', example: 38 })
  paidOrderCount!: number;

  @ApiProperty({ description: '客单价（分）＝ 实收 / 支付成功单数', example: 3379 })
  avgOrderCent!: number;

  @ApiProperty({ description: '当前待接单（已支付未接单）', example: 3 })
  pendingCount!: number;

  @ApiProperty({ description: '当前制作中', example: 5 })
  preparingCount!: number;

  @ApiProperty({ description: '当前待取餐 / 待配送', example: 2 })
  readyCount!: number;

  @ApiProperty({ description: '今日取消数', example: 1 })
  cancelledCount!: number;

  @ApiProperty({
    description:
      '今日新客数。商家口径＝会员档案首单在今日（会员只分商户不分门店，门店角色看到的也是商户级新客）；' +
      '平台口径＝账号注册在今日',
    example: 6,
  })
  newCustomerCount!: number;

  @ApiProperty({ description: '今日有成交的门店数（平台版为商户数）', example: 3 })
  activeStoreCount!: number;
}

/** 趋势上的一个点 */
export class TrendPointDto {
  @ApiProperty({ description: '自然日（服务器时区），形如 2026-10-14', example: '2026-10-14' })
  date!: string;

  @ApiProperty({ description: '当日实收（分），没有成交就是 0', example: 128400 })
  revenueCent!: number;

  @ApiProperty({ description: '当日下单数', example: 42 })
  orderCount!: number;
}

/** 今日分时：折线图要的是连续小时，缺的小时补 0 */
export class HourPointDto {
  @ApiProperty({ description: '小时 0–23', example: 12 })
  hour!: number;

  @ApiProperty({ description: '该小时单量', example: 18 })
  orderCount!: number;

  @ApiProperty({ description: '该小时实收（分）', example: 61200 })
  revenueCent!: number;
}

/** 排行榜的一项 */
export class RankItemDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: '珍珠奶茶' })
  name!: string;

  @ApiProperty({ description: '金额（分）；纯计数的榜为 0', example: 38000 })
  valueCent!: number;

  @ApiProperty({ description: '件数 / 单数', example: 10 })
  count!: number;
}

/** 占比的一项 */
export class MixItemDto {
  @ApiProperty({ example: 'pickup' })
  key!: string;

  @ApiProperty({ example: '自提' })
  label!: string;

  @ApiProperty({ example: 21 })
  count!: number;

  @ApiProperty({ description: '金额（分）', example: 79800 })
  valueCent!: number;
}

/** 实时单流的一条 */
export class LiveOrderDto {
  @ApiProperty({ example: 'O20261014000042' })
  orderNo!: string;

  @ApiProperty({ example: '人民路店' })
  storeName!: string;

  @ApiProperty({ description: '桌号（堂食），无则 null', nullable: true, example: 'A3' })
  tableNo!: string | null;

  @ApiProperty({ description: '取餐码（仅自提），无则 null', nullable: true, example: '0009' })
  pickupCode!: string | null;

  @ApiProperty({ description: '就餐方式：0 堂食 / 1 自提 / 2 外卖', example: 1 })
  diningType!: number;

  @ApiProperty({ description: '订单状态码，含义见订单状态枚举', example: 30 })
  status!: number;

  @ApiProperty({ description: '应付金额（分）', example: 3800 })
  payableCent!: number;

  @ApiProperty({ description: '商品件数', example: 2 })
  itemCount!: number;

  @ApiProperty({ description: '菜品摘要，形如「珍珠奶茶×2、宫保鸡丁×1」', example: '珍珠奶茶×2' })
  itemsSummary!: string;

  @ApiProperty({ description: '备注（忌口等），无则 null', nullable: true, example: '不要葱' })
  remark!: string | null;

  @ApiProperty({ description: '下单时间（ISO）', example: '2026-10-14T12:03:00.000Z' })
  createdAt!: string;

  @ApiProperty({ description: '距今多少分钟，前端不再自己算时钟', example: 4 })
  minutesAgo!: number;
}

/** 商家端大屏 */
export class MerchantScreenDto {
  @ApiProperty({ description: '这份快照的生成时间（ISO），大屏要显示它', example: '2026-10-14T12:07:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ description: '当前统计范围的名字（商户名或门店名）', example: '示例餐饮' })
  scopeName!: string;

  @ApiProperty({ description: '今日概览' })
  overview!: ScreenOverviewDto;

  @ApiProperty({ description: '近 14 天趋势（含空日补零）' })
  trend!: TrendPointDto[];

  @ApiProperty({ description: '今日 0–23 时分布' })
  hourly!: HourPointDto[];

  @ApiProperty({ description: '今日菜品销量 Top 10' })
  topDishes!: RankItemDto[];

  @ApiProperty({ description: '今日门店实收 Top 10' })
  storeRank!: RankItemDto[];

  @ApiProperty({ description: '今日就餐方式占比' })
  diningMix!: MixItemDto[];

  @ApiProperty({ description: '最近 20 单' })
  liveOrders!: LiveOrderDto[];
}

/** 平台端大屏 */
export class PlatformScreenDto {
  @ApiProperty({ description: '快照生成时间（ISO）' })
  generatedAt!: string;

  @ApiProperty({ description: '今日概览（全站）' })
  overview!: ScreenOverviewDto;

  @ApiProperty({ description: '平台盘子：商户 / 门店 / 账号总数' })
  totals!: { merchants: number; stores: number; customers: number };

  @ApiProperty({ description: '近 30 天趋势' })
  trend!: TrendPointDto[];

  @ApiProperty({ description: '今日商户实收 Top 10' })
  merchantRank!: RankItemDto[];

  @ApiProperty({ description: '今日门店实收 Top 10' })
  storeRank!: RankItemDto[];

  @ApiProperty({ description: '今日支付渠道占比' })
  channelMix!: MixItemDto[];

  @ApiProperty({ description: '最近 20 单（全站）' })
  liveOrders!: LiveOrderDto[];
}
