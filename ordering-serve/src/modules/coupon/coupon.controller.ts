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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { requireMerchantScope, resolveMerchantScope } from '../../common/utils/tenant.util';
import { isPlatformRole } from '../../shared/constants/role-scope';
import { CouponTemplateStatus } from '../../shared/enums/coupon.enum';
import { Permission } from '../../shared/enums/permission.enum';
import { CouponService } from './coupon.service';
import {
  CouponTemplateDto,
  CustomerCouponDto,
  QueryCouponTemplateDto,
  UpsertCouponTemplateDto,
} from './dto/coupon.dto';

/**
 * 优惠券模板管理（商户后台 + 平台后台共用一套接口）。
 *
 * 归属判定只有一句话：**写路径的 merchantId 由角色推导，不接受前端传值**。
 * 平台侧固定写成平台券（merchantId = null），商户侧固定成自己租户，
 * 于是「平台改商户的券」「商户改别人的券」两种越界都落进「优惠券不存在」。
 */
@ApiTags('优惠券')
@ApiBearerAuth()
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  /** 写路径归属：平台 = 平台券（null），商户 = Token 里的租户 */
  private writableScope(currentUser: AuthUser): number | null {
    return isPlatformRole(currentUser.role) ? null : requireMerchantScope(currentUser);
  }

  @Get()
  @Permissions(Permission.COUPON_READ)
  @ApiOperation({
    summary: '券模板列表',
    description: '商户只看自己的；平台默认看全部，可用 merchantId / platformOnly 收窄。',
  })
  list(
    @Query() query: QueryCouponTemplateDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<CouponTemplateDto>> {
    return this.couponService.paginateTemplates(query, resolveMerchantScope(currentUser, query.merchantId));
  }

  @Post()
  @Permissions(Permission.COUPON_UPDATE)
  @ApiOperation({
    summary: '新建券模板',
    description: '有效期二选一：validDays（领取后 N 天）或 startAt + endAt（固定区间）。',
  })
  create(
    @Body() dto: UpsertCouponTemplateDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<CouponTemplateDto> {
    return this.couponService.createTemplate(dto, this.writableScope(currentUser));
  }

  @Put(':id')
  @Permissions(Permission.COUPON_UPDATE)
  @ApiOperation({ summary: '修改券模板' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCouponTemplateDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<CouponTemplateDto> {
    return this.couponService.updateTemplate(id, dto, this.writableScope(currentUser));
  }

  @Put(':id/status')
  @Permissions(Permission.COUPON_UPDATE)
  @ApiOperation({
    summary: '上架 / 下架',
    description: '下架不回收已发出的券 —— 那是顾客资产。',
  })
  @ApiQuery({ name: 'status', example: 1, description: '1 上架 / 0 下架' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('status', ParseIntPipe) status: CouponTemplateStatus,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<CouponTemplateDto> {
    return this.couponService.changeTemplateStatus(id, status, this.writableScope(currentUser));
  }

  @Delete(':id')
  @Permissions(Permission.COUPON_UPDATE)
  @ApiOperation({ summary: '删除券模板（已有人领取则拒绝，请改为下架）' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.couponService.removeTemplate(id, this.writableScope(currentUser));
  }

  @Get(':id/records')
  @Permissions(Permission.COUPON_READ)
  @ApiOperation({ summary: '某张券的发放与核销记录' })
  records(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<CustomerCouponDto>> {
    return this.couponService.paginateIssued(
      id,
      this.writableScope(currentUser),
      Number(page) || 1,
      Math.min(Number(pageSize) || 20, 100),
    );
  }
}
