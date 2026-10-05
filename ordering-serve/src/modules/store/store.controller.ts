import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { CreateStoreDto } from './dto/create-store.dto';
import { QueryStoreDto } from './dto/query-store.dto';
import { StoreResponseDto } from './dto/store-response.dto';
import { UpdateStoreStatusDto } from './dto/update-store-status.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreService } from './store.service';

/**
 * 门店管理接口。
 *
 * 租户范围完全由服务端依据 Token 解析，前端传的 merchantId 仅平台管理员有效。
 */
@ApiTags('门店管理')
@ApiBearerAuth()
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @Permissions(Permission.STORE_READ)
  @ApiOperation({ summary: '分页查询门店列表' })
  paginate(
    @Query() query: QueryStoreDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<StoreResponseDto>> {
    return this.storeService.paginate(query, currentUser);
  }

  @Get(':id')
  @Permissions(Permission.STORE_READ)
  @ApiOperation({ summary: '查询门店详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<StoreResponseDto> {
    return this.storeService.findOne(id, currentUser);
  }

  @Post()
  @Permissions(Permission.STORE_CREATE)
  @ApiOperation({
    summary: '新增门店',
    description:
      '商户管理员开的是自己商户下的店（merchantId 一律取自 Token，前端传值被忽略）；' +
      '平台侧账号必须显式指定 merchantId。',
  })
  create(
    @Body() dto: CreateStoreDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<StoreResponseDto> {
    return this.storeService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.STORE_UPDATE)
  @ApiOperation({
    summary: '编辑门店资料',
    description: '只改名称 / 编码 / 地址 / 电话 / 营业状态。启停走 PATCH /stores/:id/status。',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<StoreResponseDto> {
    return this.storeService.update(id, dto, currentUser);
  }

  @Patch(':id/status')
  @Permissions(Permission.STORE_DISABLE)
  @ApiOperation({
    summary: '禁用 / 恢复门店',
    description:
      '平台侧（管理员与被授权 store:disable 的运营）高于商家侧：平台禁用的门店商户解不开。' +
      '门店被禁用后 C 端下单与收银台代客开单一并拒绝。',
  })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreStatusDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<StoreResponseDto> {
    return this.storeService.changeStatus(id, dto, currentUser);
  }

  @Delete(':id')
  @Permissions(Permission.STORE_DELETE)
  @ApiOperation({
    summary: '删除门店（软删除）',
    description: '门店下已有订单时拒绝删除，请改为禁用；商户与平台同一口径。',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.storeService.remove(id, currentUser);
  }
}
