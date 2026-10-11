import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';
import { PopupService } from './popup.service';
import { PopupResponseDto } from './dto/popup-response.dto';
import { SavePopupDto } from './dto/save-popup.dto';

/**
 * 活动弹窗管理接口（平台管理端专有）。
 *
 * 与小程序布局配置同样的双重设防：类级 `@Roles(PLATFORM_ADMIN)` + `@Permissions`。
 * 弹窗是直接糊在顾客屏幕上的东西，权限点刻意不进可授权白名单。
 */
@ApiTags('活动弹窗')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('popups')
export class PopupController {
  constructor(private readonly popupService: PopupService) {}

  @Get()
  @Permissions(Permission.POPUP_READ)
  @ApiOperation({
    summary: '弹窗列表（带投放数据）',
    description: '按优先级升序；每条带曝光 PV/UV、点击 UV 与点击率，运营据此判断该下线哪个。',
  })
  list(): Promise<PopupResponseDto[]> {
    return this.popupService.list();
  }

  @Post()
  @Permissions(Permission.POPUP_UPDATE)
  @ApiOperation({
    summary: '新建弹窗',
    description: 'content 按 type 分派校验：图文型要图片地址，公告型要标题与正文；跳转必须命中小程序真有的页面。',
  })
  create(
    @Body() dto: SavePopupDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PopupResponseDto> {
    return this.popupService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.POPUP_UPDATE)
  @ApiOperation({ summary: '覆盖弹窗配置（整条重写，含启停与生效时间）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SavePopupDto,
  ): Promise<PopupResponseDto> {
    return this.popupService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.POPUP_UPDATE)
  @ApiOperation({
    summary: '删除弹窗',
    description: '配置软删；展示日志保留，已发生的曝光不该因为活动下线而蒸发。',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.popupService.remove(id);
  }
}
