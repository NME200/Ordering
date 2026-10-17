import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { resolveMerchantScope } from '../../common/utils/tenant.util';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { Permission } from '../../shared/enums/permission.enum';
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
 * 闸门只有 `customer:read|update` 这一个权限点，**不再叠类级 @Roles**：
 * 之前两者并存，而这两个点又在可授权白名单里，于是平台管理员给运营专员勾了
 * 照样 403 —— 白名单上多出一个永远无效的选项，比不给更糟（它会误导运维）。
 * 撤掉角色硬闸没有放宽任何边界：商户管理员与门店管理员的清单里根本没有这两个点
 * （见 shared/constants/permission-map），能写 `users.permissions` 的也只有平台账号，
 * 而能从 admin 端登录的只有平台角色（见 portal-map）。
 */
@ApiTags('顾客管理')
@ApiBearerAuth()
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
