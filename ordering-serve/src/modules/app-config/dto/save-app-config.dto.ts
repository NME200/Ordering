import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
 * 组件项。
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

/** 四个装修页各自的组件列表；数组顺序即渲染顺序 */
export class AppConfigPagesDto {
  @ApiPropertyOptional({ description: '首页组件列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '首页最多 12 个组件' })
  @ValidateNested({ each: true })
  @Type(() => AppConfigSectionDto)
  home?: AppConfigSectionDto[];

  @ApiPropertyOptional({ description: '个人中心组件列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '个人中心最多 12 个组件' })
  @ValidateNested({ each: true })
  @Type(() => AppConfigSectionDto)
  member?: AppConfigSectionDto[];

  @ApiPropertyOptional({ description: '会员卡组件列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '会员卡最多 12 个组件' })
  @ValidateNested({ each: true })
  @Type(() => AppConfigSectionDto)
  card?: AppConfigSectionDto[];

  @ApiPropertyOptional({ description: '优惠券中心组件列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '优惠券中心最多 12 个组件' })
  @ValidateNested({ each: true })
  @Type(() => AppConfigSectionDto)
  coupon?: AppConfigSectionDto[];
}

/**
 * 保存布局配置（新建草稿或覆盖草稿）。
 *
 * 草稿**允许不完整**（素材与文案常分几天凑齐，拦着不让存只会逼人绕路），
 * 这里只做结构与格式校验；必填项在「发布」时才卡死。
 * 四个页面是一个整体，所以一次保存就带齐四页 —— 不存在「只发了首页」的半套皮肤。
 */
export class SaveAppConfigDto {
  /**
   * 先 trim 再判空：`@IsNotEmpty` 只认 `''`，一串空格是能过的，
   * 于是库里会多出一份叫「   」的方案 —— 列表里看着就是空的。
   */
  @ApiProperty({ description: '方案名称', example: '国庆皮肤', maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '方案名称不能为空' })
  @MaxLength(40, { message: '方案名称最长 40 个字符' })
  name!: string;

  @ApiProperty({ description: '全局主题 token（四页共享）' })
  @ValidateNested()
  @Type(() => AppThemeDto)
  theme!: AppThemeDto;

  @ApiProperty({ description: '四个页面的组件列表' })
  @ValidateNested()
  @Type(() => AppConfigPagesDto)
  pages!: AppConfigPagesDto;
}

/**
 * 只改方案名字。
 *
 * 生效中与历史版本的内容是锁住的（要改就复制成新草稿），但名字只是给人看的标签 ——
 * 运营攒了一排「未命名方案 / 副本 副本」认不出哪个是哪个，光靠复制一份解决不了。
 */
export class RenameAppConfigDto {
  @ApiProperty({ description: '方案名称', example: '2026 国庆（已下线）', maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '方案名称不能为空' })
  @MaxLength(40, { message: '方案名称最长 40 个字符' })
  name!: string;
}
