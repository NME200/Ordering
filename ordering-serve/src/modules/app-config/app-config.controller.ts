import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';
import { AppConfigService } from './app-config.service';
import { AppConfigResponseDto } from './dto/app-config-response.dto';
import { RenameAppConfigDto, SaveAppConfigDto } from './dto/save-app-config.dto';

/**
 * 小程序布局配置接口（平台管理端专有）。
 *
 * 与支付配置同样的双重设防：类级 `@Roles(PLATFORM_ADMIN)` + `@Permissions`。
 * 能改小程序界面等于能改全体顾客看到的品牌呈现，不下放给运营专员 ——
 * 这两个权限点刻意不在可授权白名单里。
 */
@ApiTags('小程序布局配置')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('app-configs')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  @Permissions(Permission.APP_CONFIG_READ)
  @ApiOperation({
    summary: '布局方案列表',
    description: '生效中的排最前，含草稿与历史版本；回滚就是对某条历史版本再发布。',
  })
  list(): Promise<AppConfigResponseDto[]> {
    return this.appConfigService.list();
  }

  @Get('current')
  @Permissions(Permission.APP_CONFIG_READ)
  @ApiOperation({ summary: '当前生效的布局方案（未发布过时为 null）' })
  current(): Promise<AppConfigResponseDto | null> {
    return this.appConfigService.current();
  }

  @Post()
  @Permissions(Permission.APP_CONFIG_UPDATE)
  @ApiOperation({
    summary: '新建草稿',
    description: '草稿允许字段不完整，只做结构与格式校验；必填项在发布时卡死。',
  })
  create(
    @Body() dto: SaveAppConfigDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<AppConfigResponseDto> {
    return this.appConfigService.createDraft(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.APP_CONFIG_UPDATE)
  @ApiOperation({ summary: '覆盖草稿内容（生效中与历史版本不可改）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveAppConfigDto,
  ): Promise<AppConfigResponseDto> {
    return this.appConfigService.updateDraft(id, dto);
  }

  @Post(':id/publish')
  @Permissions(Permission.APP_CONFIG_UPDATE)
  @ApiOperation({
    summary: '发布（旧的转历史，版本号 +1）',
    description: '这里做完整校验；顶替与写版本在同一事务内，避免出现两行同时生效。',
  })
  publish(@Param('id', ParseIntPipe) id: number): Promise<AppConfigResponseDto> {
    return this.appConfigService.publish(id);
  }

  @Put(':id/name')
  @Permissions(Permission.APP_CONFIG_UPDATE)
  @ApiOperation({
    summary: '只改方案名称（三种状态都可以）',
    description: '内容锁着是锁的，但名字只是标签：一排「未命名方案 / 副本 副本」认不出谁是谁，得能改。',
  })
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameAppConfigDto,
  ): Promise<AppConfigResponseDto> {
    return this.appConfigService.rename(id, dto.name);
  }

  @Delete(':id')
  @Permissions(Permission.APP_CONFIG_UPDATE)
  @ApiOperation({
    summary: '删除方案（草稿与历史版本，软删）',
    description: '生效中的不可删。历史版本可以删，代价是那一版回滚不到了。',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.appConfigService.remove(id);
  }
}
