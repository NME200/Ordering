import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppConfigService } from '../app-config/app-config.service';
import { PublicPopupQueue, PopupService } from '../popup/popup.service';
import { PointActivityService, PublicPointActivityBanner } from '../point-activity/point-activity.service';
import { QueryPublicPopupDto, ReportPopupEventDto } from '../popup/dto/public-popup.dto';
import { QueryAppConfigDto } from './dto/query-app-config.dto';
import { CancelPublicOrderDto } from './dto/cancel-public-order.dto';
import { QueryPublicOrderDto } from './dto/query-public-order.dto';
import { QueryPublicStoresDto } from './dto/query-public-stores.dto';
import { PublicMenuResponseDto } from './dto/public-menu-response.dto';
import { PublicOrderResponseDto } from './dto/public-order-response.dto';
import { PublicStoreListResponseDto } from './dto/public-store-list-response.dto';
import { PublicStoreResponseDto } from './dto/public-store-response.dto';
import { PublicService } from './public.service';

/**
 * C 端公开读接口（扫码点餐小程序用）。
 *
 * 整个控制器无需登录，所以：
 * - 一律不返回内部字段（商户 ID、员工、成本、会员价等）；
 * - 门店不可用与「不存在」合并成 404，不给匿名调用方枚举治理信息；
 * - 每个接口按 IP 限流 —— 这是项目里第一个真正对匿名流量敞开的读面。
 */
@ApiTags('C 端公开接口')
@Controller('public')
@Public()
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly appConfigService: AppConfigService,
    private readonly popupService: PopupService,
    private readonly pointActivityService: PointActivityService,
  ) {}

  @Get('app-config')
  @RateLimit({ bucket: 'public-app-config', limit: 30, windowSeconds: 60 })
  @ApiOperation({
    summary: '小程序布局配置（无需登录，一次给全四页）',
    description:
      '返回主题 token 与首页 / 个人中心 / 会员卡 / 优惠券中心四页的组件列表。' +
      '刻意不按 pageKey 拆成四个接口：顾客小程序启动时一次性缓存整份皮肤，' +
      '拆开会把这个限流桶一次消耗四次，还会让四页版本号各走各的。' +
      '没发布过时回落到内置默认，小程序首启不会白屏；' +
      '带 `?v=本地版本` 命中时只回 `{ unchanged: true }`。',
  })
  appConfig(@Query() query: QueryAppConfigDto): Promise<Record<string, unknown>> {
    return this.appConfigService.resolveForClient(query.v);
  }

  @Get('popup/list')
  @RateLimit({ bucket: 'public-popup', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '当前场景的活动弹窗队列（无需登录）',
    description:
      '后端只按状态 / 生效时间 / 场景 / 门店过滤，**频次不在这里判**：' +
      '匿名接口认不得「这个人」，小程序本地按 popupId + 日期拦截，show-log 再回写一条留痕。' +
      '队列行为（queue / top_only、最多弹几个）由优先级最高的那条决定。',
  })
  popupList(@Query() query: QueryPublicPopupDto): Promise<PublicPopupQueue> {
    return this.popupService.resolveForClient(query);
  }

  @Post('popup/show-log')
  @RateLimit({ bucket: 'public-popup-report', limit: 120, windowSeconds: 60 })
  @ApiOperation({
    summary: '上报弹窗曝光 / 关闭 / 点击',
    description: '同一 (弹窗, 访客, 日期) 落同一行：曝光累加次数，关闭与点击只置位。',
  })
  popupReport(@Body() dto: ReportPopupEventDto): Promise<void> {
    return this.popupService.report(dto);
  }

  @Get('stores/:storeId/point-activity')
  @RateLimit({ bucket: 'public-point-activity', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '本店此刻生效的积分活动（无需登录）',
    description:
      '与门店菜单同一个形状：租户完全由路径上的 storeId 决定，门店不可用一律 404。' +
      '只回活动名与文案条，**不回规则参数**：顾客拿多少分一律在服务端算，' +
      '把百分比下发到小程序只会多一个能被改显示的假口径。' +
      '没有活动、或活动没配活动条文案时回 null，界面据此整块不渲染。',
  })
  pointActivity(
    @Param('storeId', ParseIntPipe) storeId: number,
  ): Promise<PublicPointActivityBanner | null> {
    return this.pointActivityService.publicBanner(storeId);
  }

  @Get('stores')
  @RateLimit({ bucket: 'public-store-list', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '门店列表（无需登录，跨商户）',
    description:
      '「查看门店」用。只返回启用中的门店且所属商户可用，不可用的直接不出现。' +
      '每店带经纬度与近 30 天月售，**距离与按距离排序在前端做**（接口不索要顾客位置）。' +
      '设计稿里的评分与起送价没有下发：后端没有评价表与配送费模型，不摆假数。',
  })
  stores(@Query() query: QueryPublicStoresDto): Promise<PublicStoreListResponseDto> {
    return this.publicService.findStores(query);
  }

  @Get('stores/:storeId')
  @RateLimit({ bucket: 'public-store', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '门店信息（无需登录）',
    description: '门店被停用或所属商户不可用时按 404 处理；打烊返回 200 且 orderable=false。',
  })
  store(
    @Param('storeId', ParseIntPipe) storeId: number,
  ): Promise<PublicStoreResponseDto> {
    return this.publicService.findStore(storeId);
  }

  @Get('stores/:storeId/menu')
  @RateLimit({ bucket: 'public-menu', limit: 60, windowSeconds: 60 })
  @ApiOperation({
    summary: '本店菜单（无需登录，一次给全）',
    description:
      '返回「分类 → 在售菜品 → 规格组」整棵树。价格与在售状态已是**本店有效值**' +
      '（商户标准菜单 + 本店例外），与收银台、下单四处同一口径；停售与下架的菜不出现，沽清的菜带 soldOut。',
  })
  menu(
    @Param('storeId', ParseIntPipe) storeId: number,
  ): Promise<PublicMenuResponseDto> {
    return this.publicService.findMenu(storeId);
  }

  @Post('orders/:orderNo/cancel')
  @RateLimit({ bucket: 'public-cancel', limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary: '取消待支付订单（订单号 + payToken 双因子）',
    description:
      '只允许取消待支付的单；已支付的单必须由商户侧走取消 + 退款，' +
      '匿名接口不碰资金。状态用条件更新，避免与支付回调抢同一行。',
  })
  cancelOrder(
    @Param('orderNo') orderNo: string,
    @Body() dto: CancelPublicOrderDto,
  ): Promise<PublicOrderResponseDto> {
    return this.publicService.cancelByOrderNo(orderNo, dto);
  }

  @Get('orders/:orderNo')
  @RateLimit({ bucket: 'public-order', limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary: '查询自己的订单（订单号 + payToken 双因子）',
    description:
      'token 取自下单响应。单号不对与 token 不对返回同一个错误，避免这里变成订单号枚举入口。',
  })
  order(
    @Param('orderNo') orderNo: string,
    @Query() query: QueryPublicOrderDto,
  ): Promise<PublicOrderResponseDto> {
    return this.publicService.findByOrderNo(orderNo, query.token);
  }
}
