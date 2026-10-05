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
import { DishService } from './dish.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { DishResponseDto } from './dto/dish-response.dto';
import { QueryDishDto } from './dto/query-dish.dto';
import { UpdateDishStatusDto } from './dto/update-dish-status.dto';
import { UpdateDishDto } from './dto/update-dish.dto';

/**
 * 菜品管理接口。
 *
 * 金额一律以「分」为单位传输与返回（见 CODEBUDDY.md 8.3）。
 */
@ApiTags('菜品')
@ApiBearerAuth()
@Controller('dishes')
export class DishController {
  constructor(private readonly dishService: DishService) {}

  @Get()
  @Permissions(Permission.DISH_READ)
  @ApiOperation({ summary: '分页查询菜品（含关联规格组）' })
  paginate(
    @Query() query: QueryDishDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<DishResponseDto>> {
    return this.dishService.paginate(query, currentUser);
  }

  @Get(':id')
  @Permissions(Permission.DISH_READ)
  @ApiOperation({ summary: '查询菜品详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishResponseDto> {
    return this.dishService.findOne(id, currentUser);
  }

  @Post()
  @Permissions(Permission.DISH_CREATE)
  @ApiOperation({ summary: '新增菜品' })
  create(
    @Body() dto: CreateDishDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishResponseDto> {
    return this.dishService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.DISH_UPDATE)
  @ApiOperation({ summary: '编辑菜品' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDishDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishResponseDto> {
    return this.dishService.update(id, dto, currentUser);
  }

  @Put(':id/status')
  @Permissions(Permission.DISH_UPDATE)
  @ApiOperation({ summary: '菜品上下架' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDishStatusDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<DishResponseDto> {
    return this.dishService.updateStatus(id, dto.status, currentUser);
  }

  @Delete(':id')
  @Permissions(Permission.DISH_DELETE)
  @ApiOperation({ summary: '删除菜品（软删除，同时解除规格组关联）' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.dishService.remove(id, currentUser);
  }
}
