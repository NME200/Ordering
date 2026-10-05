import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';

/** 发起支付入参 */
export class CreatePaymentDto {
  @ApiProperty({
    description:
      '支付票据：下单接口（POST /orders）响应中返回的 payToken。' +
      '服务端据此校验调用方归属，缺失或不匹配一律按「订单不存在」处理。',
    example: '3f6f0b8c-4c1e-4a37-9d0e-7b1f2c8a5d11',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty({ message: 'payToken 不能为空' })
  @MaxLength(64, { message: 'payToken 最长 64 个字符' })
  payToken!: string;

  @ApiPropertyOptional({
    description: '支付渠道，不传默认 mock（联调渠道）。线下收款请使用「标记线下收款」接口',
    enum: PaymentChannel,
    default: PaymentChannel.MOCK,
  })
  @IsOptional()
  @IsEnum(PaymentChannel, { message: 'channel 取值不合法' })
  channel?: PaymentChannel;

  @ApiPropertyOptional({ description: '微信支付所需的用户 openid（其他渠道忽略）', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'openId 最长 64 个字符' })
  openId?: string;
}
