import { ApiProperty } from '@nestjs/swagger';
import { DishStatus, DISH_STATUS_LABELS } from '../../../shared/enums/dish-status.enum';
import { SpecGroupResponseDto } from '../../spec-group/dto/spec-group-response.dto';
import { StoreDish } from '../../store-dish/entities/store-dish.entity';
import { StoreDishResponseDto } from '../../store-dish/dto/store-dish-response.dto';
import type { EffectiveDish } from '../../store-dish/store-dish.service';
import { Dish } from '../entities/dish.entity';

/** 菜品出参 DTO */
export class DishResponseDto {
  @ApiProperty({ description: '菜品 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '所属商户 ID', example: 1 })
  merchantId!: number;

  @ApiProperty({ description: '所属分类 ID', example: 1 })
  categoryId!: number;

  @ApiProperty({ description: '菜品名称', example: '宫保鸡丁' })
  name!: string;

  @ApiProperty({ description: '菜品描述', nullable: true })
  description!: string | null;

  @ApiProperty({ description: '菜品图片地址', nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: '售价（分）', example: 3800 })
  price!: number;

  @ApiProperty({ description: '会员价（分）', nullable: true, example: 3400 })
  memberPrice!: number | null;

  @ApiProperty({
    description: '归属门店 ID：null 表示全商户通用，非 null 表示该店专属',
    nullable: true,
    example: null,
  })
  storeId!: number | null;

  /**
   * 以下四项是**按查询门店合并例外后的有效值**。
   * 没有门店上下文（商户管理员看标准菜单）时，它们等于标准值本身，
   * 因此调用方可以无条件读这几个字段，不需要分支。
   */
  @ApiProperty({ description: '本店有效售价（分）= 门店价 ?? 标准价', example: 3800 })
  effectivePrice!: number;

  @ApiProperty({ description: '本店有效会员价（分）', nullable: true })
  effectiveMemberPrice!: number | null;

  @ApiProperty({ description: '本店当前能不能点（综合上下架、本店停售与沽清）', example: true })
  onSale!: boolean;

  @ApiProperty({ description: '本店是否已沽清', example: false })
  soldOut!: boolean;

  @ApiProperty({ description: '本店对这道菜是否存在例外记录', example: false })
  overridden!: boolean;

  /**
   * 本店例外的**原始值**（未选门店时为 null）。
   *
   * 前端开关必须绑这里而不是绑 `onSale`：`onSale` 是「标准上架 AND 本店在售 AND 未沽清」
   * 的合成结果，拿它当开关值会出现「拨回来了但显示没变」的弹回错觉。
   */
  @ApiProperty({
    description: '本店例外原始值（未选门店时为 null）',
    type: StoreDishResponseDto,
    nullable: true,
  })
  storeOverride!: StoreDishResponseDto | null;

  @ApiProperty({ description: '计价单位', example: '份' })
  unit!: string;

  @ApiProperty({ description: '排序值', example: 0 })
  sort!: number;

  @ApiProperty({ description: '状态：0 下架 / 1 上架', enum: DishStatus })
  status!: DishStatus;

  @ApiProperty({ description: '状态名称', example: '已上架' })
  statusLabel!: string;

  @ApiProperty({ description: '是否推荐菜', example: false })
  isRecommend!: boolean;

  @ApiProperty({ description: '累计销量', example: 0 })
  soldCount!: number;

  @ApiProperty({ description: '关联的规格组（含规格项）', type: [SpecGroupResponseDto] })
  specGroups!: SpecGroupResponseDto[];

  @ApiProperty({ description: '创建时间', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间', type: String, format: 'date-time' })
  updatedAt!: Date;

  static from(
    entity: Dish,
    specGroups: SpecGroupResponseDto[] = [],
    effective?: EffectiveDish,
    override?: StoreDish | null,
  ): DishResponseDto {
    const dto = new DishResponseDto();
    dto.id = entity.id;
    dto.merchantId = entity.merchantId;
    dto.categoryId = entity.categoryId;
    dto.name = entity.name;
    dto.description = entity.description;
    dto.imageUrl = entity.imageUrl;
    dto.price = entity.price;
    dto.memberPrice = entity.memberPrice;
    dto.storeId = entity.storeId;
    dto.effectivePrice = effective?.price ?? entity.price;
    dto.effectiveMemberPrice = effective?.memberPrice ?? entity.memberPrice;
    dto.onSale = effective?.onSale ?? entity.status === DishStatus.ON_SHELF;
    dto.soldOut = effective?.soldOut ?? false;
    dto.overridden = effective?.overridden ?? false;
    dto.storeOverride = override ? StoreDishResponseDto.from(override) : null;
    dto.unit = entity.unit;
    dto.sort = entity.sort;
    dto.status = entity.status;
    dto.statusLabel = DISH_STATUS_LABELS[entity.status];
    dto.isRecommend = entity.isRecommend;
    dto.soldCount = entity.soldCount;
    dto.specGroups = specGroups;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
