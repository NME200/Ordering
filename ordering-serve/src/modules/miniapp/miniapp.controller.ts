import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';
import { MiniappConfigService } from './miniapp-config.service';
import { MiniappConfigResponseDto, SaveMiniappConfigDto } from './dto/miniapp-config.dto';

/**
 * 小程序凭据接口（平台管理端专有）。
 *
 * 平台在这里只做一件事：登记微信小程序的 AppID / AppSecret —— 调微信接口出桌码
 * 用的是这**一份全局凭据**（与「平台一套商户号全局收款」同构）。
 * 桌码本身不在平台端生成，那是商家在自己后台的动作（见门店的 table-qrcodes 接口）。
 *
 * 与支付配置同样的双重设防：类级 `@Roles(PLATFORM_ADMIN)` + `@Permissions`。
 * AppSecret 能换到调用微信接口的 access_token，等于小程序的身份，
 * 这两个权限点刻意不在可授权白名单里 —— 运营专员勾了也不该拿到。
 */
@ApiTags('小程序配置')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('miniapp')
export class MiniappController {
  constructor(private readonly configService: MiniappConfigService) {}

  @Get('config')
  @Permissions(Permission.MINIAPP_READ)
  @ApiOperation({
    summary: '当前小程序凭据',
    description: 'AppSecret 只回「是否已配置」，响应中不含密钥原文。',
  })
  current(): Promise<MiniappConfigResponseDto> {
    return this.configService.current();
  }

  @Put('config')
  @Permissions(Permission.MINIAPP_UPDATE)
  @ApiOperation({
    summary: '保存小程序凭据',
    description: 'AppSecret 留空表示保持原值不变。',
  })
  save(
    @Body() dto: SaveMiniappConfigDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<MiniappConfigResponseDto> {
    return this.configService.save(dto, currentUser);
  }

  @Post('config/test')
  @Permissions(Permission.MINIAPP_UPDATE)
  @ApiOperation({
    summary: '测试凭据可用性',
    description: '用已存的 AppID / AppSecret 换一次 access_token，把微信的原文错误带回界面。',
  })
  test(): Promise<{ ok: boolean; message: string }> {
    return this.configService.test();
  }
}
