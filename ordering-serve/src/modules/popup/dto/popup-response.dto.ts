import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '../../../shared/enums/common-status.enum';
import {
  POPUP_TYPE_LABELS,
  POPUP_SCENE_LABELS,
  PopupScene,
  PopupType,
} from '../constants/popup-schema';
import { PopupConfig, PopupContent } from '../entities/popup-config.entity';

/** 弹窗投放数据（后台列表那四个指标） */
export class PopupStatsDto {
  @ApiProperty({ description: '累计曝光次数（show_count 求和）', example: 1280 })
  exposurePv!: number;

  @ApiProperty({ description: '曝光人数（按访客标识去重）', example: 940 })
  exposureUv!: number;

  @ApiProperty({ description: '点击主按钮的人数', example: 120 })
  clickUv!: number;

  @ApiProperty({ description: '点击率 = 点击人数 / 曝光人数，无曝光为 null', nullable: true })
  clickRate!: number | null;
}

/** 弹窗出参 */
export class PopupResponseDto {
  @ApiProperty({ description: '弹窗 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '后台名称', example: '秋季新品' })
  name!: string;

  @ApiProperty({ description: '类型', enum: PopupType })
  type!: PopupType;

  @ApiProperty({ description: '类型名称', example: '图文弹窗' })
  typeLabel!: string;

  @ApiProperty({ description: '触发场景', enum: PopupScene })
  scene!: PopupScene;

  @ApiProperty({ description: '场景名称', example: '进首页' })
  sceneLabel!: string;

  @ApiProperty({ description: '指定门店 ID；null 为全平台通用', nullable: true })
  storeId!: number | null;

  @ApiProperty({ description: '优先级，数字越小越优先' })
  priority!: number;

  @ApiProperty({ description: '状态：0 停用 / 1 启用', enum: CommonStatus })
  status!: CommonStatus;

  @ApiProperty({ description: '生效开始时间', type: String, format: 'date-time', nullable: true })
  startTime!: Date | null;

  @ApiProperty({ description: '生效结束时间', type: String, format: 'date-time', nullable: true })
  endTime!: Date | null;

  @ApiProperty({ description: '频次：once / daily / always' })
  frequency!: string;

  @ApiProperty({ description: '单次触发最多弹几个' })
  maxShow!: number;

  @ApiProperty({ description: '多弹窗方式：queue / top_only' })
  queueMode!: string;

  @ApiProperty({ description: '内容与样式' })
  content!: PopupContent;

  @ApiProperty({ description: '投放数据', type: PopupStatsDto })
  stats!: PopupStatsDto;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: PopupConfig, stats?: PopupStatsDto): PopupResponseDto {
    const dto = new PopupResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.type = entity.type;
    dto.typeLabel = POPUP_TYPE_LABELS[entity.type];
    dto.scene = entity.scene;
    dto.sceneLabel = POPUP_SCENE_LABELS[entity.scene];
    dto.storeId = entity.storeId;
    dto.priority = entity.priority;
    dto.status = entity.status;
    dto.startTime = entity.startTime;
    dto.endTime = entity.endTime;
    dto.frequency = entity.frequency;
    dto.maxShow = entity.maxShow;
    dto.queueMode = entity.queueMode;
    dto.content = entity.content;
    dto.stats = stats ?? PopupResponseDto.emptyStats();
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  static emptyStats(): PopupStatsDto {
    const stats = new PopupStatsDto();
    stats.exposurePv = 0;
    stats.exposureUv = 0;
    stats.clickUv = 0;
    stats.clickRate = null;
    return stats;
  }
}
