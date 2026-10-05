import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { PaymentChannel } from '../../shared/enums/payment-channel.enum';
import { Role } from '../../shared/enums/role.enum';
import { ChannelSchemaDto, PaymentConfigResponseDto } from './dto/payment-config-response.dto';
import { SavePaymentConfigDto } from './dto/save-payment-config.dto';
import { UpdatePaymentConfigStatusDto } from './dto/update-payment-config-status.dto';
import { PaymentConfigService } from './payment-config.service';

/**
 * 支付配置接口（平台管理端专有）。
 *
 * 双重设防：类级 `@Roles(PLATFORM_ADMIN)` 把角色挡在门外，`@Permissions` 再挡一次 ——
 * 这些是资金级凭据，宁可重复校验。
 *
 * 注意：`GET /payment-configs/schema` 必须声明在 `/:channel` 之前，
 * 否则会被路径参数路由吃掉（本项目已踩过一次）。
 */
@ApiTags('支付配置')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('payment-configs')
export class PaymentConfigController {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  @Get()
  @Permissions(Permission.PAYMENT_CONFIG_READ)
  @ApiOperation({
    summary: '全渠道支付配置',
    description: '敏感字段只返回「是否已配置」，响应中不含任何密钥原文。',
  })
  list(): Promise<PaymentConfigResponseDto[]> {
    return this.paymentConfigService.listAll();
  }

  @Get('schema')
  @Permissions(Permission.PAYMENT_CONFIG_READ)
  @ApiOperation({
    summary: '各渠道表单字段定义',
    description: '供平台管理端动态渲染表单：字段名、控件类型、必填与条件必填、帮助文案。',
  })
  schema(): ChannelSchemaDto[] {
    return this.paymentConfigService.getSchema();
  }

  @Put(':channel')
  @Permissions(Permission.PAYMENT_CONFIG_UPDATE)
  @ApiOperation({
    summary: '保存指定渠道的配置',
    description:
      '先完整校验再落库；敏感字段留空表示保持原值。保存后渠道注册表立即热加载，无需重启。',
  })
  save(
    @Param('channel') channel: PaymentChannel,
    @Body() dto: SavePaymentConfigDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaymentConfigResponseDto> {
    return this.paymentConfigService.save(channel, dto, currentUser);
  }

  @Put(':channel/enabled')
  @Permissions(Permission.PAYMENT_CONFIG_UPDATE)
  @ApiOperation({
    summary: '启用 / 停用指定渠道',
    description: '启用前要求必填字段齐备，避免出现「点得动但一定付不成功」的渠道。',
  })
  setEnabled(
    @Param('channel') channel: PaymentChannel,
    @Body() dto: UpdatePaymentConfigStatusDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaymentConfigResponseDto> {
    return this.paymentConfigService.setEnabled(channel, dto.enabled, currentUser);
  }
}
