import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { PopupScene } from '../constants/popup-schema';

/** C 端拉弹窗队列的入参 */
export class QueryPublicPopupDto {
  @ApiProperty({ description: '触发场景', enum: PopupScene })
  @IsEnum(PopupScene, { message: '不支持的触发场景' })
  scene!: PopupScene;

  @ApiPropertyOptional({ description: '当前门店 ID（进店 / 支付成功场景带上，用于门店专属弹窗）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'storeId 必须为整数' })
  @Min(1, { message: 'storeId 最小为 1' })
  storeId?: number;
}

/** 弹窗埋点上报的入参 */
export class ReportPopupEventDto {
  @ApiProperty({ description: '弹窗 ID' })
  @Type(() => Number)
  @IsInt({ message: 'popupId 必须为整数' })
  @Min(1, { message: 'popupId 最小为 1' })
  popupId!: number;

  /**
   * 访客设备标识，由小程序生成后存 Storage。
   *
   * 限定字符集与长度：这行会进数据库并参与唯一索引，随手传个 3MB 字符串
   * 就能把日志表撑爆，所以宁可拒了。
   */
  @ApiProperty({ description: '访客设备标识（8-64 位字母数字与 -_）', example: 'v-7f3a9c21be' })
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'visitorKey 需为 8-64 位字母、数字、下划线或连字符' })
  visitorKey!: string;

  @ApiProperty({ description: '事件类型', enum: ['show', 'close', 'click'], example: 'show' })
  @IsIn(['show', 'close', 'click'], { message: 'action 只能是 show / close / click' })
  action!: 'show' | 'close' | 'click';
}
