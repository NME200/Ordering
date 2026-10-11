import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { resolveMerchantScope } from '../../common/utils/tenant.util';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { CreateReviewDto, QueryReviewDto, ReplyReviewDto, ReviewDto } from './dto/review.dto';
import { ReviewService } from './review.service';

/** 顾客侧评价 */
@Public()
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@ApiTags('顾客端 · 评价')
@Controller('customer/reviews')
export class ReviewCustomerController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @RateLimit({ bucket: 'customer-review', limit: 10, windowSeconds: 60 })
  @ApiOperation({
    summary: '提交评价',
    description: '仅限本人已完成的订单，一单一评；提交成功赠送积分。',
  })
  create(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviewService.create(customer.customerId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '我的评价' })
  mine(@CurrentCustomer() customer: AuthCustomer): Promise<ReviewDto[]> {
    return this.reviewService.listMine(customer.customerId);
  }
}

/** 商户 / 平台侧评价管理 */
@ApiTags('评价管理')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @Permissions(Permission.REVIEW_READ)
  @ApiOperation({ summary: '评价列表（可按门店 / 星级 / 未回复筛选）' })
  list(
    @Query() query: QueryReviewDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<ReviewDto>> {
    return this.reviewService.paginateForStaff(query, currentUser);
  }

  @Get('summary')
  @Permissions(Permission.REVIEW_READ)
  @ApiOperation({ summary: '评分概览（平均分 + 条数）' })
  summary(
    @Query('storeId') storeId: string | undefined,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<{ avg: number; total: number }> {
    // 平台账号没有租户归属，必须显式指定看哪个商户，不能默默退化成「查全部」
    const merchantId = resolveMerchantScope(currentUser);
    if (merchantId === null) {
      throw BusinessException.badRequest(ErrorCode.TENANT_CONTEXT_MISSING, '请指定商户');
    }
    return this.reviewService.summary(merchantId, storeId ? Number(storeId) : undefined);
  }

  @Post(':id/reply')
  @Permissions(Permission.REVIEW_UPDATE)
  @ApiOperation({ summary: '商家回复评价' })
  reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<ReviewDto> {
    return this.reviewService.reply(id, dto, currentUser);
  }
}
