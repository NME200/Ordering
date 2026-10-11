import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { resolveMerchantScope } from '../../common/utils/tenant.util';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { Permission } from '../../shared/enums/permission.enum';
import { Role } from '../../shared/enums/role.enum';
import { CustomerService } from './customer.service';
import { MemberService } from './member.service';
import { MemberProfile } from './entities/member-profile.entity';
import { CustomerAdminRowDto, QueryCustomerAdminDto } from './dto/query-customer.dto';

/**
 * 顾客管理（**平台后台专有**）。
 *
 * 顾客账号是全平台账号：一个账号可以在平台下所有商户下单，会员资产才按商户分档。
 * 所以商户后台看不到这份名册，也没有封禁能力 —— 让一家店封一个账号，
 * 等于替整个平台决定这个人还能不能消费，那是越权。
 *
 * 两道闸：类级 `@Roles(PLATFORM_ADMIN)` + `customer:read|update` 权限点，
 * 权限点已从商户管理员与门店管理员的清单里撤掉（见 shared/constants/permission-map）。
 */
@ApiTags('顾客管理')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('customers')
export class CustomerAdminController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly memberService: MemberService,
  ) {}

  @Get()
  @Permissions(Permission.CUSTOMER_READ)
  @ApiOperation({ summary: '顾客列表（含本商户的会员资产）' })
  list(
    @Query() query: QueryCustomerAdminDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<CustomerAdminRowDto>> {
    return this.customerService.paginateForStaff(
      query,
      resolveMerchantScope(currentUser, query.merchantId),
    );
  }

  @Get(':id/member')
  @Permissions(Permission.CUSTOMER_READ)
  @ApiOperation({ summary: '某位顾客在指定商户的会员档案' })
  @ApiQuery({ name: 'merchantId', example: 1, description: '会员资产按商户建档，平台侧必须指定看哪家' })
  member(
    @Param('id', ParseIntPipe) id: number,
    @Query('merchantId', ParseIntPipe) merchantId: number,
  ): Promise<MemberProfile> {
    // 控制器已锁平台管理员，这里用显式传入的 merchantId —— 平台没有自己的租户
    return this.memberService.getOrCreate(id, merchantId);
  }

  @Put(':id/status')
  @Permissions(Permission.CUSTOMER_UPDATE)
  @ApiOperation({
    summary: '封禁 / 解封顾客',
    description: '封禁会自增会话版本号，手里的令牌立即全部失效 —— 只改状态位是拦不住已登录顾客的。',
  })
  @ApiQuery({ name: 'status', example: 0, description: '1 正常 / 0 封禁' })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('status', ParseIntPipe) status: CommonStatus,
  ): Promise<void> {
    return this.customerService.changeStatus(id, status);
  }
}
