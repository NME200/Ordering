import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { PaymentChannel } from '../../shared/enums/payment-channel.enum';
import { PaymentChannelDto, PaymentResponseDto } from './dto/payment-response.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { PaymentService } from './payment.service';

/**
 * 支付接口。
 *
 * 回调接口由第三方渠道服务器调用（无登录态），安全性依赖渠道验签。
 * 其余接口为商户端管理接口。
 */
@ApiTags('支付')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Get('channels')
  @ApiOperation({ summary: '可用支付渠道（online=true 的才能被 C 端用于发起支付）' })
  channels(): PaymentChannelDto[] {
    return this.paymentService.listChannels();
  }

  @Public()
  @Post('callback/:channel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '支付结果回调（第三方渠道调用）',
    description:
      '由渠道服务器直接调用，签名只在服务端生成与校验，不会出现在任何响应里。' +
      '本地联调请改用 POST /payments/dev/mock-pay 模拟渠道支付成功。',
  })
  callback(
    @Param('channel') channel: string,
    @Body() body: Record<string, unknown>,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<PaymentResponseDto | null> {
    // 真实渠道（如微信支付）验签必须用原始请求体，这里优先取 rawBody
    const rawBody = request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(body);

    return this.paymentService.handleCallback(this.paymentService.resolveChannel(channel), {
      rawBody,
      headers: request.headers,
      payload: body,
    });
  }

  /**
   * 模拟渠道支付成功（联调专用）。
   *
   * 取代此前「把回调签名塞进 payParams 返回给客户端」的做法 —— 那等于把服务端的
   * 信任根交给调用方，任何人都能自助把任意订单标记为已支付。
   * DevOnlyGuard 在生产环境下按「接口不存在」处理。
   */
  @Public()
  @UseGuards(DevOnlyGuard)
  @Post('dev/mock-pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '模拟渠道支付成功（仅非生产环境）',
    description: '在服务端生成合法回调报文并走完整验签链路，行为与真实渠道回调一致。',
  })
  mockPay(@Body() dto: SimulatePaymentDto): Promise<PaymentResponseDto | null> {
    return this.paymentService.simulateOnlinePayment(
      dto.channel ?? PaymentChannel.MOCK,
      dto.paymentNo,
    );
  }

  @Get()
  @ApiBearerAuth()
  @Permissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: '分页查询支付流水' })
  paginate(
    @Query() query: QueryPaymentDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<PaymentResponseDto>> {
    return this.paymentService.paginate(query, currentUser);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Permissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: '查询支付单详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id, currentUser);
  }

  @Post(':id/refund')
  @ApiBearerAuth()
  @Permissions(Permission.PAYMENT_REFUND)
  @ApiOperation({ summary: '发起退款（当前仅支持整单全额退款）' })
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.refund(id, dto, currentUser);
  }
}
