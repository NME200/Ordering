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
import { CreateSpecGroupDto } from './dto/create-spec-group.dto';
import { QuerySpecGroupDto } from './dto/query-spec-group.dto';
import { SpecGroupResponseDto } from './dto/spec-group-response.dto';
import { UpdateSpecGroupDto } from './dto/update-spec-group.dto';
import { SpecGroupService } from './spec-group.service';

/**
 * 规格组管理接口（含组内规格项）。
 *
 * 规格组为商户级共享资源，菜品通过 specGroupIds 关联引用。
 */
@ApiTags('规格组')
@ApiBearerAuth()
@Controller('spec-groups')
export class SpecGroupController {
  constructor(private readonly specGroupService: SpecGroupService) {}

  @Get()
  @Permissions(Permission.SPEC_READ)
  @ApiOperation({ summary: '分页查询规格组（含规格项）' })
  paginate(
    @Query() query: QuerySpecGroupDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<SpecGroupResponseDto>> {
    return this.specGroupService.paginate(query, currentUser);
  }

  /** 注意：必须声明在 :id 之前，否则会被 :id 路由匹配走 */
  @Get('options')
  @Permissions(Permission.SPEC_READ)
  @ApiOperation({ summary: '查询全部规格组（不分页，含规格项，供菜品编辑选择）' })
  list(
    @Query() query: QuerySpecGroupDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<SpecGroupResponseDto[]> {
    return this.specGroupService.list(currentUser, query.merchantId);
  }

  @Get(':id')
  @Permissions(Permission.SPEC_READ)
  @ApiOperation({ summary: '查询规格组详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<SpecGroupResponseDto> {
    return this.specGroupService.findOne(id, currentUser);
  }

  @Post()
  @Permissions(Permission.SPEC_CREATE)
  @ApiOperation({ summary: '新增规格组（规格项一并提交）' })
  create(
    @Body() dto: CreateSpecGroupDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<SpecGroupResponseDto> {
    return this.specGroupService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.SPEC_UPDATE)
  @ApiOperation({ summary: '编辑规格组（options 为整体覆盖语义）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecGroupDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<SpecGroupResponseDto> {
    return this.specGroupService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Permissions(Permission.SPEC_DELETE)
  @ApiOperation({ summary: '删除规格组（软删除，被菜品引用时禁止）' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.specGroupService.remove(id, currentUser);
  }
}
