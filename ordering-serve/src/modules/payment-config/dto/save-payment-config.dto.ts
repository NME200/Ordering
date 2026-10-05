import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 保存某个支付渠道的配置。
 *
 * `settings` 的键由服务端 `CHANNEL_FIELDS[channel]` 定义，因此这里只能先按
 * 字典校验、再在 Service 里逐字段核对必填 / 条件必填 / 格式 / 长度 ——
 * 键名是动态的，DTO 装饰器写不出来，也**不允许**用 `whitelist` 静默丢掉未知键：
 * 拼错字段名必须报错，不能悄悄不保存。
 *
 * 敏感字段传空字符串表示「保持原值不变」，这样界面回显掩码后不必重新粘贴私钥。
 */
export class SavePaymentConfigDto {
  @ApiProperty({
    description:
      '渠道配置键值对，键必须来自该渠道的字段定义。敏感字段留空表示不修改原值。',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { appId: '2021000000000000', signMode: 'key', appPrivateKey: '' },
  })
  @IsObject({ message: 'settings 必须为对象' })
  settings!: Record<string, unknown>;

  @ApiPropertyOptional({ description: '备注', maxLength: 255 })
  @IsOptional()
  @IsString({ message: 'remark 必须为字符串' })
  @MaxLength(255, { message: 'remark 最长 255 个字符' })
  remark?: string;
}
