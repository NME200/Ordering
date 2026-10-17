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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { requireMerchantScope } from '../../common/utils/tenant.util';
import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { PointActivityResponseDto } from './dto/point-activity-response.dto';
import { CreatePointActivityDto } from './dto/create-point-activity.dto';
import { QueryPointActivityDto } from './dto/query-point-activity.dto';
import { UpdatePointActivityDto } from './dto/update-point-activity.dto';
import { UpdatePointActivityStatusDto } from './dto/update-point-activity-status.dto';
import { PointActivityService } from './point-activity.service';

/**
 * 积分营销活动接口。
 *
 * 治理动作（列表 / 新建 / 编辑 / 启停 / 删除）全部**方法级** `@Roles(PLATFORM_ADMIN)`：
 * 活动决定全体顾客拿多少分，与装修配置、活动弹窗同一档，权限点也不进可授权白名单。
 *
 * 商户侧只有一个只读入口 `GET /point-activities/effective`：商户管理员与店长有
 * `point-activity:read`，但它们读的是「按自己 Token 现算出的本店生效活动」，
 * 读不到别家的配置，更没有开关权。刻意不用类级 @Roles —— 那样会把只读入口一起锁死，
 * 而另开一个控制器又会和 `GET /:id` 抢路由。
 */
@ApiTags('积分活动')
@ApiBearerAuth()
@Controller('point-activities')
export class PointActivityController {
  constructor(private readonly activityService: PointActivityService) {}

  /**
   * 商户/店长只读：本店此刻参与中的活动。
   *
   * 必须声明在 `:id` 之前，否则会被 `:id` 的路由吃掉（与 `GET /orders/status-count` 同一个坑）。
   */
  @Get('effective')
  @Permissions(Permission.POINT_ACTIVITY_READ)
  @ApiOperation({
    summary: '本店生效中的积分活动（只读）',
    description:
      '商户侧账号的租户一律取自 Token，传 merchantId 无效；平台侧账号没有租户上下文，需显式指定 merchantId 才能预览某家商户。',
  })
  effective(
    @CurrentUser() currentUser: AuthUser,
    @Query() query: QueryPointActivityDto,
  ): Promise<PointActivityResponseDto[]> {
    return this.activityService.listEffectiveForMerchant(
      requireMerchantScope(currentUser, query.merchantId),
    );
  }

  @Get()
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_READ)
  @ApiOperation({
    summary: '活动列表（平台端，带发放统计）',
    description: '每条带净发放分与参与人数；商户范围涉及的具体商户名一并返回。',
  })
  list(@Query() query: QueryPointActivityDto): Promise<PaginatedDto<PointActivityResponseDto>> {
    return this.activityService.paginate(query);
  }

  @Get(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_READ)
  @ApiOperation({ summary: '活动详情' })
  detail(@Param('id', ParseIntPipe) id: number): Promise<PointActivityResponseDto> {
    return this.activityService.findOne(id);
  }

  @Post()
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_UPDATE)
  @ApiOperation({
    summary: '新建活动（默认停用）',
    description:
      '规则按 ruleType 校验：倍率至少要填一项加成；满额返送的分不得超过基础分的 3 倍。' +
      '新建出来是停用状态，开活动是第二个动作。',
  })
  create(
    @Body() dto: CreatePointActivityDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PointActivityResponseDto> {
    return this.activityService.create(dto, currentUser);
  }

  @Put(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_UPDATE)
  @ApiOperation({
    summary: '编辑活动资料与规则',
    description: '不含启停。改的是启用中的活动时会重跑一次时间窗 × 商户范围的重叠校验。',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePointActivityDto,
  ): Promise<PointActivityResponseDto> {
    return this.activityService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_UPDATE)
  @ApiOperation({
    summary: '启用 / 停用',
    description: '独立接口。启用时校验：活动未结束、且不与另一个启用中的活动在商户范围上重叠。',
  })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePointActivityStatusDto,
  ): Promise<PointActivityResponseDto> {
    return this.activityService.changeStatus(id, dto.status);
  }

  @Delete(':id')
  @Roles(Role.PLATFORM_ADMIN)
  @Permissions(Permission.POINT_ACTIVITY_UPDATE)
  @ApiOperation({
    summary: '删除活动（软删）',
    description: '已经发放过积分的活动删不掉：历史流水要能指回活动名，要停止发分请用停用。',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.activityService.remove(id);
  }
}
