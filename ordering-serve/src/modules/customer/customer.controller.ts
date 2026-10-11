import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { MemberLevel } from '../../shared/enums/customer.enum';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { AddressService } from './address.service';
import { CouponService } from '../coupon/coupon.service';
import { CustomerOrderService } from './customer-order.service';
import { CustomerService } from './customer.service';
import { MemberService, MemberTask } from './member.service';
import { CustomerOrderCountDto, CustomerOverviewDto, CustomerProfileDto, MemberAssetDto, PointLogDto } from './dto/customer-response.dto';
import { CustomerAddressDto, CreateCustomerAddressDto, UpdateCustomerAddressDto } from './dto/customer-address.dto';
import { CustomerOrderDto, QueryCustomerOrderDto } from './dto/customer-order.dto';
import { BindPhoneDto, BindWechatOpenidDto, BindWechatPhoneDto, CustomerSessionDto, SendPhoneCodeDto, UpdateCustomerProfileDto } from './dto/customer-auth.dto';

/** 可选商户上下文：不传表示「还没进任何一家店」，资产按 0 处理 */
class MerchantScopeQueryDto {
  @ApiPropertyOptional({ description: '商户 ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;
}

/**
 * 顾客端「我的」全套接口。
 *
 * 类级 `@Public()` 的含义是「绕开只认后台账号的全局员工守卫」，不是谁都能进：
 * 除 session / 验证码两个真公开的路由外，其余方法都挂了 CustomerAuthGuard，
 * 由它做真正的顾客令牌校验。少挂这个守卫就等于裸奔，所以新增路由时必须带上。
 */
@Public()
@ApiTags('顾客端 · 我的')
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly orderService: CustomerOrderService,
    private readonly memberService: MemberService,
    private readonly couponService: CouponService,
    private readonly addressService: AddressService,
  ) {}

  // ==================== 注册 / 登录 ====================

  @Public()
  @RateLimit({ bucket: 'customer-session', limit: 30, windowSeconds: 60 })
  @Post('session')
  @ApiOperation({
    summary: '静默注册并换取令牌',
    description:
      '用设备 visitorKey 换顾客令牌，同一 key 反复调用只会得到同一个账号；' +
      '带上 wxCode 时先按微信 openid 认人（换设备不丢账号），换不到就照旧按设备认，登录不会因此失败。',
  })
  session(@Body() dto: CustomerSessionDto): Promise<{
    accessToken: string;
    expiresIn: string;
    profile: CustomerProfileDto;
  }> {
    return this.customerService.session(dto);
  }

  @Public()
  @RateLimit({ bucket: 'customer-sms', limit: 5, windowSeconds: 60 })
  @Post('phone/code')
  @ApiOperation({
    summary: '获取绑定手机号的验证码',
    description: '未接入短信通道：生产环境直接拒绝，非生产环境把验证码回显在响应里供联调。',
  })
  sendCode(@Body() dto: SendPhoneCodeDto): Promise<{ sent: boolean; devCode?: string }> {
    return this.customerService.sendPhoneCode(dto.phone);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('phone')
  @ApiOperation({ summary: '绑定手机号' })
  bindPhone(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: BindPhoneDto,
  ): Promise<CustomerProfileDto> {
    return this.customerService.bindPhone(customer, dto);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('wechat/openid')
  @ApiOperation({
    summary: '补绑微信身份（openid）',
    description:
      '存量账号本地已有令牌，session 这辈子不会再调一次，所以「换手机不丢账号」要靠这一步。' +
      '前端只在小程序里、且本地没记过「已绑」时打一次。',
  })
  bindWechatOpenid(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: BindWechatOpenidDto,
  ): Promise<{ bound: boolean }> {
    return this.customerService.bindWechatOpenid(customer, dto.code);
  }

  @UseGuards(CustomerAuthGuard)
  @RateLimit({ bucket: 'customer-wx-phone', limit: 6, windowSeconds: 60 })
  @ApiBearerAuth()
  @Post('wechat/phone')
  @ApiOperation({
    summary: '用微信手机号组件一键绑定手机号',
    description:
      '入参是 button open-type=getPhoneNumber 回调里的 code，服务端拿去换手机号。' +
      '这是**扣费接口**（0.03 元/次），code 五分钟失效且只能用一次，所以失败只能让顾客重新点。',
  })
  bindPhoneByWechat(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: BindWechatPhoneDto,
  ): Promise<CustomerProfileDto> {
    return this.customerService.bindPhoneByWechat(customer, dto.code);
  }

  // ==================== 资料与总览 ====================

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: '本人资料（手机号已打码）' })
  profile(@CurrentCustomer() customer: AuthCustomer): Promise<CustomerProfileDto> {
    return this.customerService.buildProfile(customer.customerId);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Put('profile')
  @ApiOperation({
    summary: '修改资料',
    description: '生日只能填一次，填过再改会被拒绝 —— 生日券按当月判定，可改就能每年重领一次。',
  })
  updateProfile(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileDto> {
    return this.customerService.updateProfile(customer.customerId, dto);
  }

  /**
   * 「我的」页一次性总览。
   *
   * 首页要显示头像、ID、三项资产、四个订单角标，拆成 6 个接口在弱网下会闪成一片，
   * 而且顾客每次切回 Tab 都要重发一遍。合并成一次，代价是商户切换时必须带 merchantId。
   */
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('overview')
  @ApiOperation({ summary: '我的页总览：资料 + 当前商户资产 + 订单四桶' })
  async overview(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: MerchantScopeQueryDto,
  ): Promise<CustomerOverviewDto> {
    const profile = await this.customerService.buildProfile(customer.customerId);
    const orderCount = await this.orderService.countBuckets(customer.customerId);

    const dto = new CustomerOverviewDto();
    dto.profile = profile;
    dto.orderCount = orderCount;

    if (query.merchantId === undefined) {
      dto.member = null;
      return dto;
    }

    const couponCount = await this.couponService.countUsable(
      customer.customerId,
      query.merchantId,
    );
    dto.member = await this.memberService.buildAssetDto(
      customer.customerId,
      query.merchantId,
      couponCount,
    );
    return dto;
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: '登出（只作废当前令牌）' })
  logout(@CurrentCustomer() customer: AuthCustomer): Promise<void> {
    return this.customerService.logout(customer);
  }

  // ==================== 订单 ====================

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('orders')
  @ApiOperation({ summary: '我的订单列表（可按四桶筛选）' })
  orders(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: QueryCustomerOrderDto,
  ): Promise<PaginatedDto<CustomerOrderDto>> {
    return this.orderService.list(customer.customerId, query);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('orders/:id')
  @ApiOperation({
    summary: '我的订单详情',
    description: '按 customer_id 判归属，不再需要 payToken；响应里也不含 payToken。',
  })
  orderDetail(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CustomerOrderDto> {
    return this.orderService.detail(customer.customerId, id);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('order-count')
  @ApiOperation({ summary: '订单四桶计数' })
  orderCount(@CurrentCustomer() customer: AuthCustomer): Promise<CustomerOrderCountDto> {
    return this.orderService.countBuckets(customer.customerId);
  }

  // ==================== 会员 ====================

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('member')
  @ApiOperation({ summary: '会员卡页数据：资产 + 成长任务 + 等级阶梯' })
  async member(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: MerchantScopeQueryDto,
  ): Promise<{ asset: MemberAssetDto | null; tasks: MemberTask[]; levels: MemberLevel[] }> {
    if (query.merchantId === undefined) {
      return { asset: null, tasks: [], levels: this.memberService.levels };
    }
    const couponCount = await this.couponService.countUsable(customer.customerId, query.merchantId);
    return {
      asset: await this.memberService.buildAssetDto(customer.customerId, query.merchantId, couponCount),
      tasks: await this.memberService.tasksFor(customer.customerId, query.merchantId),
      levels: this.memberService.levels,
    };
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('points')
  @ApiOperation({ summary: '积分流水（最近 20 条）' })
  async points(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: MerchantScopeQueryDto,
  ): Promise<PointLogDto[]> {
    if (query.merchantId === undefined) {
      return [];
    }
    return this.memberService.listLogs(customer.customerId, query.merchantId);
  }

  // ==================== 收货地址 ====================

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('addresses')
  @ApiOperation({ summary: '地址列表（默认置顶）' })
  addresses(@CurrentCustomer() customer: AuthCustomer): Promise<CustomerAddressDto[]> {
    return this.addressService.list(customer.customerId);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('addresses')
  @ApiOperation({ summary: '新增地址（第一条自动成为默认）' })
  createAddress(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: CreateCustomerAddressDto,
  ): Promise<CustomerAddressDto> {
    return this.addressService.create(customer.customerId, dto);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Put('addresses/:id')
  @ApiOperation({ summary: '编辑地址' })
  updateAddress(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerAddressDto,
  ): Promise<CustomerAddressDto> {
    return this.addressService.update(customer.customerId, id, dto);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Put('addresses/:id/default')
  @ApiOperation({ summary: '设为默认地址' })
  setDefaultAddress(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CustomerAddressDto> {
    return this.addressService.setDefault(customer.customerId, id);
  }

  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Delete('addresses/:id')
  @ApiOperation({ summary: '删除地址（删掉默认时自动顶上最新一条）' })
  removeAddress(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.addressService.remove(customer.customerId, id);
  }
}
