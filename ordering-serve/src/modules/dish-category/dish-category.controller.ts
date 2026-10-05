import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { DishCategoryService } from './dish-category.service';
import { CreateDishCategoryDto } from './dto/create-dish-category.dto';
import { DishCategoryResponseDto } from './dto/dish-category-response.dto';
import { QueryDishCategoryDto } from './dto/query-dish-category.dto';
import { UpdateDishCategoryDto } from './dto/update-dish-category.dto';

/**
 * 菜品分类管理接口。
 *
 * 租户范围完全由服务端依据 Token 解析，前端传的 merchantId 仅平台管理员有效。
 */
@ApiTags('菜品分类')
@ApiBearerAuth()
@Controller('dish-categories')
export class DishCategoryController {
  constructor(private readonly dishCategoryService: DishCategoryService) {}

  @Get()
  @Permissions(Permission.CATEGORY_READ)
  @ApiOperation({ summary: '分页查询菜品分类' })
  paginate(
    @Query() query: QueryDishCategoryDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<DishCategoryResponseDto>> {
    return this.dishCategoryService.paginate(query, currentUser);
  }

  /** 注意：必须声明在 :id 之前，否则会被 :id 路由匹配走 */
  @Get('options')
  @Permissions(Permission.CATEGORY_READ)
  @ApiOperation({ summary: '查询全部分类（不分页，供下拉选择）' })
  list(
    @Query() query: QueryDishCategoryDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishCategoryResponseDto[]> {
    return this.dishCategoryService.list(currentUser, query.merchantId, query.storeId);
  }

  @Get(':id')
  @Permissions(Permission.CATEGORY_READ)
  @ApiOperation({ summary: '查询菜品分类详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishCategoryResponseDto> {
    return this.dishCategoryService.findOne(id, currentUser);
  }

  @Post()
  @Permissions(Permission.CATEGORY_CREATE)
  @ApiOperation({ summary: '新增菜品分类' })
  create(
    @Body() dto: CreateDishCategoryDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishCategoryResponseDto> {
    return this.dishCategoryService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.CATEGORY_UPDATE)
  @ApiOperation({ summary: '编辑菜品分类' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDishCategoryDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishCategoryResponseDto> {
    return this.dishCategoryService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Permissions(Permission.CATEGORY_DELETE)
  @ApiOperation({ summary: '删除菜品分类（软删除，分类下有菜品时禁止）' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.dishCategoryService.remove(id, currentUser);
  }
}
