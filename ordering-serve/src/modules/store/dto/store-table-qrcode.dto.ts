import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { StoreTableQrcode } from '../entities/store-table-qrcode.entity';

/** 门店 ID 走路径参数，这里只收桌号 */
export class GenerateTableQrcodeDto {
  @ApiProperty({ description: '桌号（必须是本店启用中的台位）', maxLength: 16 })
  @IsString()
  @MaxLength(16, { message: '桌号最长 16 个字符' })
  tableNo!: string;
}

/** 批量生成的结果 */
export class GenerateTableQrcodeAllDto {
  @ApiProperty({ description: '本店启用中的台位数' })
  total!: number;

  @ApiProperty({ description: '本次成功生成的张数（含覆盖重生成）' })
  generated!: number;

  @ApiProperty({ description: '生成失败的桌号与原因，逐条列给商家看' })
  failed!: { tableNo: string; reason: string }[];
}

/** 桌码行（列表里不带图片，避免一屏拉几 MB） */
export class TableQrcodeRowDto {
  @ApiProperty({ description: '记录 ID' })
  id!: number;

  @ApiProperty({ description: '门店 ID' })
  storeId!: number;

  @ApiProperty({ description: '桌号' })
  tableNo!: string;

  @ApiProperty({ description: '写进码里的 scene（形如 s=1&t=A12）' })
  scene!: string;

  @ApiProperty({ description: '扫码落地页' })
  page!: string;

  @ApiProperty({ description: '这张码指向的小程序版本：release / trial / develop' })
  envVersion!: string;

  @ApiProperty({ description: '生成人；系统内建数据可能为空', nullable: true })
  generatedByName!: string | null;

  @ApiProperty({ description: '生成时间' })
  updatedAt!: Date;

  static from(row: StoreTableQrcode): TableQrcodeRowDto {
    const dto = new TableQrcodeRowDto();
    dto.id = row.id;
    dto.storeId = row.storeId;
    dto.tableNo = row.tableNo;
    dto.scene = row.scene;
    dto.page = row.page;
    dto.envVersion = row.envVersion;
    dto.generatedByName = row.generatedByName;
    dto.updatedAt = row.updatedAt;
    return dto;
  }
}

/** 带图片的出参：base64 直接给前端做预览与下载链接，不需要再开一个流式下载接口 */
export class TableQrcodeImageDto extends TableQrcodeRowDto {
  @ApiProperty({ description: '图片的 data URL，可直接放进 <img> 或 a[download]' })
  imageBase64!: string;

  /**
   * 按字节头判 MIME。
   *
   * 微信这个接口回的不一定是 PNG（实测是 JPEG，`/9j/` 开头），写死 image/png
   * 会让下载下来的文件后缀与真实格式不符，某些看图软件与打印驱动直接认不出。
   */
  private static mimeType(base64: string): string {
    return base64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  }

  static withImage(row: StoreTableQrcode): TableQrcodeImageDto {
    const dto = Object.assign(
      new TableQrcodeImageDto(),
      TableQrcodeRowDto.from(row),
    ) as TableQrcodeImageDto;
    dto.imageBase64 = `data:${TableQrcodeImageDto.mimeType(row.imageBase64)};base64,${row.imageBase64}`;
    return dto;
  }
}
