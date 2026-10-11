import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MINIAPP_ENV_VERSIONS } from '../constants/miniapp.constants';

/**
 * 保存小程序配置。
 *
 * 平台这一侧**只有凭据**：AppID 与 AppSecret。桌码长什么样、扫开进哪个页面，
 * 是服务端固定口径（见 constants/miniapp.constants.ts），不给界面配；
 * 出码动作在商家自己的「桌码管理」里做。
 *
 * appSecret 留空表示**保持原值不变** —— 界面上永远不会回显已存的密钥，
 * 改别的项时不该被迫重填一次。
 */
export class SaveMiniappConfigDto {
  @ApiPropertyOptional({ description: '小程序 AppID，形如 wx1234567890abcdef', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'AppID 最长 32 个字符' })
  appId?: string;

  @ApiPropertyOptional({
    description: '小程序 AppSecret。留空表示不改动已存的那把',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'AppSecret 最长 64 个字符' })
  appSecret?: string;

  @ApiPropertyOptional({
    description:
      '桌码指向的小程序版本。未发布时 release 的码扫不开，要选 trial（体验版，扫码的人需在体验成员里）或 develop',
    enum: MINIAPP_ENV_VERSIONS,
  })
  @IsOptional()
  @IsIn([...MINIAPP_ENV_VERSIONS], { message: 'envVersion 只能是 release / trial / develop' })
  envVersion?: string;

  @ApiPropertyOptional({ description: '备注', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '备注最长 255 个字符' })
  remark?: string;
}

/** 配置出参：密钥只回「是否已配置」，绝不回原文 */
export class MiniappConfigResponseDto {
  @ApiPropertyOptional({ description: 'AppID；未配置为 null', nullable: true })
  appId!: string | null;

  @ApiProperty({ description: 'AppSecret 是否已配置（响应里永远没有它的原文）' })
  appSecretConfigured!: boolean;

  @ApiProperty({ description: '凭据是否已配齐（配齐后商家才能在自己的后台出桌码）' })
  credentialsReady!: boolean;

  @ApiProperty({ description: '主密钥是否可用（CONFIG_SECRET_KEY）' })
  masterKeyReady!: boolean;

  @ApiProperty({ description: '出码写给哪个版本：release / trial / develop' })
  envVersion!: string;

  @ApiPropertyOptional({ description: '备注', nullable: true })
  remark!: string | null;

  @ApiPropertyOptional({ description: '最后修改人', nullable: true })
  updatedByName!: string | null;

  @ApiProperty({ description: '最后修改时间' })
  updatedAt!: Date;

  static from(input: {
    appId: string | null;
    appSecretConfigured: boolean;
    masterKeyReady: boolean;
    envVersion: string;
    remark: string | null;
    updatedByName: string | null;
    updatedAt: Date;
  }): MiniappConfigResponseDto {
    const dto = new MiniappConfigResponseDto();
    dto.appId = input.appId;
    dto.appSecretConfigured = input.appSecretConfigured;
    dto.credentialsReady = Boolean(input.appId) && input.appSecretConfigured;
    dto.masterKeyReady = input.masterKeyReady;
    dto.envVersion = input.envVersion;
    dto.remark = input.remark;
    dto.updatedByName = input.updatedByName;
    dto.updatedAt = input.updatedAt;
    return dto;
  }
}
