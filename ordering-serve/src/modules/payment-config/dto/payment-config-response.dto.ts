import { ApiProperty } from '@nestjs/swagger';
import { PaymentConfig } from '../entities/payment-config.entity';
import { ChannelField } from '../constants/channel-fields';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNEL_META,
  PaymentChannel,
} from '../../../shared/enums/payment-channel.enum';

/**
 * 敏感字段的**状态**（永不包含原文）。
 * 界面据此显示「已配置 / 未配置」，运营要靠重填来覆盖，不可能把已存的私钥读出来。
 */
export class SecretFieldStateDto {
  @ApiProperty({ description: '是否已经存有该密钥' })
  configured!: boolean;
}

/** 支付渠道配置出参 */
export class PaymentConfigResponseDto {
  @ApiProperty({ description: '渠道标识', enum: PaymentChannel })
  channel!: PaymentChannel;

  @ApiProperty({ description: '渠道名称', example: '支付宝' })
  channelLabel!: string;

  @ApiProperty({ description: '是否为在线渠道（可被 C 端发起支付）' })
  online!: boolean;

  @ApiProperty({
    description: '服务端是否已接入该渠道实现；false 表示配置可保存但暂不会真正生效',
  })
  implemented!: boolean;

  @ApiProperty({ description: '渠道说明文案' })
  description!: string;

  @ApiProperty({ description: '是否启用', enum: CommonStatus })
  enabled!: CommonStatus;

  @ApiProperty({
    description: '非敏感字段的当前值（商户号、APPID、网关、通知地址等）',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  values!: Record<string, string>;

  @ApiProperty({
    description: '敏感字段的配置状态；**响应中绝不含任何密钥原文**',
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: { configured: { type: 'boolean' } },
    },
  })
  secrets!: Record<string, SecretFieldStateDto>;

  @ApiProperty({ description: '必填字段（含条件必填）是否都已具备' })
  complete!: boolean;

  @ApiProperty({ description: '缺失的必填字段名称，供界面提示', type: [String] })
  missingLabels!: string[];

  @ApiProperty({ description: '备注', nullable: true })
  remark!: string | null;

  @ApiProperty({ description: '最后修改人姓名快照', nullable: true })
  updatedByName!: string | null;

  @ApiProperty({ description: '最后修改时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(
    entity: PaymentConfig,
    ctx: { fields: ChannelField[]; settings: Record<string, string>; missingLabels: string[] },
  ): PaymentConfigResponseDto {
    const meta = PAYMENT_CHANNEL_META[entity.channel];
    const dto = new PaymentConfigResponseDto();

    dto.channel = entity.channel;
    dto.channelLabel = PAYMENT_CHANNEL_LABELS[entity.channel];
    dto.online = meta.online;
    dto.implemented = meta.implemented;
    dto.description = meta.description;
    dto.enabled = entity.enabled;

    const values: Record<string, string> = {};
    const secrets: Record<string, SecretFieldStateDto> = {};
    for (const field of ctx.fields) {
      if (field.secret) {
        secrets[field.key] = { configured: Boolean(ctx.settings[field.key]) };
      } else {
        values[field.key] = ctx.settings[field.key] ?? '';
      }
    }
    dto.values = values;
    dto.secrets = secrets;

    dto.complete = ctx.missingLabels.length === 0;
    dto.missingLabels = ctx.missingLabels;
    dto.remark = entity.remark;
    dto.updatedByName = entity.updatedByName;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

/** 单个渠道的表单字段定义，供平台管理端动态渲染表单 */
export class ChannelSchemaDto {
  @ApiProperty({ description: '渠道标识', enum: PaymentChannel })
  channel!: PaymentChannel;

  @ApiProperty({ description: '渠道名称' })
  channelLabel!: string;

  @ApiProperty({ description: '该渠道的字段定义', type: 'array', items: { type: 'object' } })
  fields!: ChannelField[];
}
