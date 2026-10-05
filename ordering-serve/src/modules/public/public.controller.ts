import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppConfigService } from '../app-config/app-config.service';
import { QueryAppConfigDto } from './dto/query-app-config.dto';
import { CancelPublicOrderDto } from './dto/cancel-public-order.dto';
import { QueryPublicOrderDto } from './dto/query-public-order.dto';
import { PublicMenuResponseDto } from './dto/public-menu-response.dto';
import { PublicOrderResponseDto } from './dto/public-order-response.dto';
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
  ) {}

  @Get('app-config')
  @RateLimit({ bucket: 'public-app-config', limit: 30, windowSeconds: 60 })
  @ApiOperation({
    summary: '小程序布局配置（无需登录）',
    description:
      '返回当前生效的首页组件与主题 token；没发布过时回落到内置默认，' +
      '小程序首启不会白屏。带 `?v=本地版本` 命中时只回 `{ unchanged: true }`。',
  })
  appConfig(@Query() query: QueryAppConfigDto): Promise<Record<string, unknown>> {
    return this.appConfigService.resolveForClient(query.v);
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
