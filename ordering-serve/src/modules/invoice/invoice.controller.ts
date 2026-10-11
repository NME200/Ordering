import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { CustomerAuthGuard } from '../customer/guards/customer-auth.guard';
import { InvoiceService } from './invoice.service';
import {
  CreateInvoiceDto,
  HandleInvoiceDto,
  InvoiceableOrderDto,
  InvoiceDto,
  InvoiceTitleDto,
  QueryInvoiceDto,
  QueryMyInvoiceDto,
  UpsertInvoiceTitleDto,
} from './dto/invoice.dto';

/** 顾客侧发票 */
@Public()
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@ApiTags('顾客端 · 发票')
@Controller('customer')
export class InvoiceCustomerController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get('invoice-titles')
  @ApiOperation({ summary: '我的抬头列表' })
  titles(@CurrentCustomer() customer: AuthCustomer): Promise<InvoiceTitleDto[]> {
    return this.invoiceService.listTitles(customer.customerId);
  }

  @Post('invoice-titles')
  @RateLimit({ bucket: 'customer-invoice-title', limit: 20, windowSeconds: 60 })
  @ApiOperation({ summary: '新增抬头' })
  createTitle(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: UpsertInvoiceTitleDto,
  ): Promise<InvoiceTitleDto> {
    return this.invoiceService.createTitle(customer.customerId, dto);
  }

  @Put('invoice-titles/:id')
  @ApiOperation({ summary: '修改抬头' })
  updateTitle(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertInvoiceTitleDto,
  ): Promise<InvoiceTitleDto> {
    return this.invoiceService.updateTitle(customer.customerId, id, dto);
  }

  @Delete('invoice-titles/:id')
  @ApiOperation({ summary: '删除抬头' })
  removeTitle(
    @CurrentCustomer() customer: AuthCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.invoiceService.removeTitle(customer.customerId, id);
  }

  @Get('invoices/invoiceable')
  @ApiOperation({
    summary: '可开票订单',
    description: '已完成、30 天内、未申请过且实付大于 0。',
  })
  invoiceable(@CurrentCustomer() customer: AuthCustomer): Promise<InvoiceableOrderDto[]> {
    return this.invoiceService.listInvoiceable(customer.customerId);
  }

  @Post('invoices')
  @RateLimit({ bucket: 'customer-invoice', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: '提交开票申请' })
  apply(
    @CurrentCustomer() customer: AuthCustomer,
    @Body() dto: CreateInvoiceDto,
  ): Promise<InvoiceDto> {
    return this.invoiceService.apply(customer.customerId, dto);
  }

  @Get('invoices')
  @ApiOperation({ summary: '我的开票记录（processing 开票中 / issued 已开票）' })
  mine(
    @CurrentCustomer() customer: AuthCustomer,
    @Query() query: QueryMyInvoiceDto,
  ): Promise<InvoiceDto[]> {
    return this.invoiceService.mine(customer.customerId, query);
  }
}

/** 商户侧开票受理 */
@ApiTags('开票受理')
@ApiBearerAuth()
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @Permissions(Permission.INVOICE_READ)
  @ApiOperation({ summary: '开票申请列表' })
  list(
    @Query() query: QueryInvoiceDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<InvoiceDto>> {
    return this.invoiceService.paginateForStaff(query, currentUser);
  }

  @Put(':id/handle')
  @Permissions(Permission.INVOICE_UPDATE)
  @ApiOperation({
    summary: '受理 / 开票 / 驳回',
    description: '本轮未接开票服务商，「已开票」由商户线下开好后回填发票号；已开票不可回退。',
  })
  handle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleInvoiceDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<InvoiceDto> {
    return this.invoiceService.handle(id, dto, currentUser);
  }
}
