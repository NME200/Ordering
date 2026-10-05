import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';

/** 模拟渠道支付成功入参（仅非生产环境可用） */
export class SimulatePaymentDto {
  @ApiProperty({
    description: '支付单号：发起支付接口响应中的 paymentNo',
    example: 'P20261005000012',
    maxLength: 32,
  })
  @IsString()
  @IsNotEmpty({ message: 'paymentNo 不能为空' })
  @MaxLength(32, { message: 'paymentNo 最长 32 个字符' })
  paymentNo!: string;

  @ApiPropertyOptional({
    description: '要模拟的渠道，默认 mock。只有实现了 buildCallbackBody 的联调渠道可用',
    enum: PaymentChannel,
    default: PaymentChannel.MOCK,
  })
  @IsOptional()
  @IsEnum(PaymentChannel, { message: 'channel 取值不合法' })
  channel?: PaymentChannel;
}
