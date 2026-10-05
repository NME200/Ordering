import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** C 端查单入参 */
export class QueryPublicOrderDto {
  @ApiProperty({
    description: '查询凭据：下单接口响应中返回的 payToken',
    example: '3f6f0b8c-4c1e-4a37-9d0e-7b1f2c8a5d11',
  })
  @IsString({ message: 'token 必须为字符串' })
  @IsNotEmpty({ message: 'token 不能为空' })
  @MaxLength(64, { message: 'token 最长 64 个字符' })
  token!: string;
}
