import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { MerchantScreenDto, PlatformScreenDto } from './dto/screen.dto';
import { StatisticsService } from './statistics.service';

/**
 * 数据大屏接口。
 *
 * 两个端点各自一次回满一整块屏，前端只轮询这一个地址 —— 见 `dto/screen.dto.ts`
 * 里「快照必须同一时刻」的理由。
 *
 * 权限点刻意复用已有的读权限，没有新造 `statistics:read`：
 * - 商家屏要的是订单与支付流水的聚合，而 `order:read` 的持有者本来就能逐单看到同样这些数；
 * - 平台屏跨商户，所以卡 `merchant:read`（商户管理员没有这一项，天然挡在外面）。
 * 新造一个权限点只会多一处「忘了勾就整块屏空白」的运维坑，换不来任何安全边界。
 */
@ApiTags('统计')
@Controller('statistics')
@ApiBearerAuth()
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('merchant-screen')
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({
    summary: '商家端数据大屏（今日概览 / 趋势 / 分时 / 排行 / 实时单流）',
    description: '范围由令牌决定：商户管理员看全商户，门店绑定角色只看本店。',
  })
  merchantScreen(@CurrentUser() currentUser: AuthUser): Promise<MerchantScreenDto> {
    return this.statisticsService.merchantScreen(currentUser);
  }

  @Get('platform-screen')
  @Permissions(Permission.MERCHANT_READ)
  @ApiOperation({
    summary: '平台端数据大屏（全站今日概览 / 30 天趋势 / 商户与门店 Top / 渠道占比）',
    description: '跨商户聚合，因此卡 merchant:read 而不是 order:read。',
  })
  platformScreen(@CurrentUser() currentUser: AuthUser): Promise<PlatformScreenDto> {
    return this.statisticsService.platformScreen(currentUser);
  }
}
