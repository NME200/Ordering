import { ApiProperty } from '@nestjs/swagger';
import { AppConfigStatus, APP_CONFIG_STATUS_LABELS } from '../../../shared/enums/app-config-status.enum';
import { AppConfig, AppConfigContent } from '../entities/app-config.entity';

/** 布局配置出参 */
export class AppConfigResponseDto {
  @ApiProperty({ description: '配置 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '方案名称', example: '国庆皮肤' })
  name!: string;

  @ApiProperty({ description: '状态', enum: AppConfigStatus })
  status!: AppConfigStatus;

  @ApiProperty({ description: '状态名称', example: '生效中' })
  statusLabel!: string;

  @ApiProperty({ description: '发布版本号；草稿为 0', example: 3 })
  version!: number;

  @ApiProperty({ description: '主题与组件列表' })
  content!: AppConfigContent;

  @ApiProperty({ description: '创建人账号 ID', nullable: true })
  createdBy!: number | null;

  @ApiProperty({ description: '发布时间', type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(entity: AppConfig): AppConfigResponseDto {
    const dto = new AppConfigResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.status = entity.status;
    dto.statusLabel = APP_CONFIG_STATUS_LABELS[entity.status];
    dto.version = entity.version;
    dto.content = entity.content;
    dto.createdBy = entity.createdBy;
    dto.publishedAt = entity.publishedAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
