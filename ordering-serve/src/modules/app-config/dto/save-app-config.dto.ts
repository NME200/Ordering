import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AppConfigSectionKey, AppThemeDto } from '../constants/app-config-schema';

/**
 * 首页组件项。
 *
 * `props` 在这里只要求是对象 —— 具体字段按 `key` 由服务端分派到各自的校验类，
 * 因为每个组件的 props 形状完全不同，塞进一个 DTO 只会得到一堆可选字段。
 */
export class AppConfigSectionDto {
  @ApiPropertyOptional({ description: '组件实例 ID；新增时可不传，服务端会补' })
  @IsOptional()
  @IsString()
  @MaxLength(40, { message: '组件 ID 最长 40 个字符' })
  id?: string;

  @ApiProperty({ description: '组件类型', enum: AppConfigSectionKey })
  @IsEnum(AppConfigSectionKey, { message: '不支持的组件类型' })
  key!: AppConfigSectionKey;

  @ApiProperty({ description: '是否显示' })
  @IsBoolean({ message: 'visible 必须为布尔值' })
  visible!: boolean;

  @ApiProperty({ description: '组件属性，字段由各组件的白名单约束' })
  @IsObject({ message: 'props 必须为对象' })
  props!: Record<string, unknown>;
}

/**
 * 保存布局配置（新建草稿或覆盖草稿）。
 *
 * 草稿**允许不完整**（凭据与素材常分几天凑齐，拦着不让存只会逼人绕路），
 * 这里只做结构与格式校验；必填项在「发布」时才卡死。
 */
export class SaveAppConfigDto {
  @ApiProperty({ description: '方案名称', example: '国庆皮肤', maxLength: 40 })
  @IsString()
  @IsNotEmpty({ message: '方案名称不能为空' })
  @MaxLength(40, { message: '方案名称最长 40 个字符' })
  name!: string;

  @ApiProperty({ description: '主题 token' })
  @ValidateNested()
  @Type(() => AppThemeDto)
  theme!: AppThemeDto;

  @ApiProperty({ description: '首页组件列表，数组顺序即渲染顺序' })
  @IsArray()
  @ArrayNotEmpty({ message: '至少需要一个组件' })
  @ArrayMaxSize(12, { message: '首页最多 12 个组件' })
  @ValidateNested({ each: true })
  @Type(() => AppConfigSectionDto)
  sections!: AppConfigSectionDto[];
}
