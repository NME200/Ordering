import { Injectable } from '@nestjs/common';
import { In, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { requireMerchantScope, resolveMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { OrderStatus } from '../../shared/enums/order-status.enum';
import {
  INVOICE_APPLY_WINDOW_DAYS,
  INVOICE_STATUS_LABELS,
  INVOICE_TITLE_KIND_LABELS,
  InvoiceStatus,
  InvoiceTitleKind,
} from '../../shared/enums/invoice.enum';
import { Store } from '../store/entities/store.entity';
import { Order } from '../order/entities/order.entity';
import { InvoiceApplication } from './entities/invoice-application.entity';
import { InvoiceTitle } from './entities/invoice-title.entity';
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

/** 抬头数量上限 */
const MAX_TITLES = 20;

/**
 * 发票服务。
 *
 * 本轮**不接开票服务商**：申请落到商户，由商户线下开电子票后回填发票号。
 * 因此「已开票」必须由人工触发，且金额一律取订单**实付** ——
 * 用券抵扣的部分没有真实收款，开票金额与流水不一致会在税务端卡住。
 */
@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(InvoiceTitle)
    private readonly titleRepository: Repository<InvoiceTitle>,
    @InjectRepository(InvoiceApplication)
    private readonly invoiceRepository: Repository<InvoiceApplication>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  // ==================== 抬头 ====================

  async listTitles(customerId: number): Promise<InvoiceTitleDto[]> {
    const rows = await this.titleRepository.find({
      where: { customerId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => this.toTitleDto(row));
  }

  async createTitle(customerId: number, dto: UpsertInvoiceTitleDto): Promise<InvoiceTitleDto> {
    const total = await this.titleRepository.count({ where: { customerId } });
    if (total >= MAX_TITLES) {
      throw BusinessException.badRequest(
        ErrorCode.INVOICE_TITLE_NOT_FOUND,
        `最多保存 ${MAX_TITLES} 个抬头`,
      );
    }
    this.assertTitleShape(dto);

    const wantDefault = dto.isDefault === 1 || total === 0;
    if (wantDefault) {
      await this.titleRepository.update({ customerId }, { isDefault: 0 });
    }
    const saved = await this.titleRepository.save(
      this.titleRepository.create({
        customerId,
        kind: dto.kind,
        title: dto.title.trim(),
        taxNo: dto.taxNo?.trim().toUpperCase() || null,
        email: dto.email.trim(),
        isDefault: wantDefault ? 1 : 0,
      }),
    );
    return this.toTitleDto(saved);
  }

  async updateTitle(
    customerId: number,
    id: number,
    dto: UpsertInvoiceTitleDto,
  ): Promise<InvoiceTitleDto> {
    const title = await this.findTitleOrFail(customerId, id);
    this.assertTitleShape(dto);

    if (dto.isDefault === 1) {
      await this.titleRepository.update({ customerId }, { isDefault: 0 });
    }
    title.kind = dto.kind;
    title.title = dto.title.trim();
    title.taxNo = dto.taxNo?.trim().toUpperCase() || null;
    title.email = dto.email.trim();
    title.isDefault = dto.isDefault === 1 ? 1 : title.isDefault;
    return this.toTitleDto(await this.titleRepository.save(title));
  }

  async removeTitle(customerId: number, id: number): Promise<void> {
    const title = await this.findTitleOrFail(customerId, id);
    await this.titleRepository.softDelete({ id: title.id, customerId });
  }

  // ==================== 顾客侧 ====================

  /**
   * 可开票订单。
   *
   * 三条硬条件：已完成、**30 天内**、没申请过。
   * 窗口期是设计稿 §三.16 的承诺，超过就不给开 —— 半年前的单突然开票，
   * 商户当期的账务早就结了，只能挂账。
   */
  async listInvoiceable(customerId: number): Promise<InvoiceableOrderDto[]> {
    const since = this.windowStart();
    const orders = await this.orderRepository.find({
      where: {
        customerId,
        status: OrderStatus.COMPLETED,
        completedAt: MoreThan(since),
      },
      order: { id: 'DESC' },
      take: 50,
    });
    if (orders.length === 0) {
      return [];
    }

    const applied = await this.invoiceRepository.find({
      where: { orderId: In(orders.map((order) => order.id)) },
      select: { orderId: true },
    });
    const appliedOrders = new Set(applied.map((row) => row.orderId));
    const stores = await this.storeRepository.find({
      where: { id: In([...new Set(orders.map((order) => order.storeId))]) },
    });
    const storeNames = new Map(stores.map((store) => [store.id, store.name]));

    return orders
      .filter((order) => !appliedOrders.has(order.id) && (order.paidAmount ?? 0) > 0)
      .map((order) => {
        const row = new InvoiceableOrderDto();
        row.orderId = order.id;
        row.orderNo = order.orderNo;
        row.storeName = storeNames.get(order.storeId) ?? '门店已下线';
        row.amount = order.paidAmount ?? order.payableAmount;
        row.completedAt = order.completedAt as Date;
        row.remainDays = Math.max(
          0,
          INVOICE_APPLY_WINDOW_DAYS -
            Math.floor((Date.now() - (order.completedAt as Date).getTime()) / 86_400_000),
        );
        return row;
      });
  }

  /** 提交开票申请 */
  async apply(customerId: number, dto: CreateInvoiceDto): Promise<InvoiceDto> {
    const invoiceable = await this.listInvoiceable(customerId);
    const target = invoiceable.find((row) => row.orderId === dto.orderId);
    if (!target) {
      throw BusinessException.badRequest(
        ErrorCode.INVOICE_ORDER_INVALID,
        '该订单不可开票（未完成、超过 30 天或已申请过）',
      );
    }
    const title = await this.findTitleOrFail(customerId, dto.titleId);
    const order = await this.orderRepository.findOne({ where: { id: dto.orderId } });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const saved = await this.invoiceRepository.save(
      this.invoiceRepository.create({
        customerId,
        merchantId: order.merchantId,
        storeId: order.storeId,
        orderId: order.id,
        orderNo: order.orderNo,
        amount: target.amount,
        kind: title.kind,
        title: title.title,
        taxNo: title.taxNo,
        email: title.email,
        remark: dto.remark?.trim() || null,
        status: InvoiceStatus.PENDING,
      }),
    );
    return this.toDto(saved);
  }

  /**
   * 我的开票记录（开票中 / 已开票）。
   *
   * 「可开票」页签不在这里 —— 它返回的是**订单**而不是申请，
   * 硬塞进同一个结构只会得到一堆假字段，所以走独立接口
   * `GET /customer/invoices/invoiceable`。
   */
  async mine(customerId: number, query: QueryMyInvoiceDto): Promise<InvoiceDto[]> {
    const tab = query.tab ?? 'processing';

    const statuses =
      tab === 'issued'
        ? [InvoiceStatus.ISSUED]
        : [InvoiceStatus.PENDING, InvoiceStatus.ISSUING, InvoiceStatus.REJECTED];

    const rows = await this.invoiceRepository.find({
      where: { customerId, status: In(statuses) },
      order: { id: 'DESC' },
      take: 100,
    });
    return rows.map((row) => this.toDto(row));
  }

  // ==================== 商户侧 ====================

  async paginateForStaff(
    query: QueryInvoiceDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<InvoiceDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser);

    const qb = this.invoiceRepository.createQueryBuilder('invoice');
    if (merchantId !== null) {
      qb.andWhere('invoice.merchant_id = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('invoice.store_id = :storeId', { storeId });
    }
    if (query.status !== undefined) {
      qb.andWhere('invoice.status = :status', { status: query.status });
    }
    if (query.keyword) {
      qb.andWhere('(invoice.order_no LIKE :keyword OR invoice.title LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }

    qb.orderBy('invoice.id', 'DESC').skip(query.skip).take(query.pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => this.toDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * 受理开票申请。
   *
   * 状态只能往前推（pending → issuing → issued）或驳回，
   * 「已开票」不能改回「待开票」—— 发票号一旦开出去就是对外凭据。
   */
  async handle(id: number, dto: HandleInvoiceDto, currentUser: AuthUser): Promise<InvoiceDto> {
    const merchantId = requireMerchantScope(currentUser);
    const invoice = await this.invoiceRepository.findOne({ where: { id, merchantId } });
    if (!invoice) {
      throw BusinessException.notFound(ErrorCode.INVOICE_NOT_FOUND, '开票申请不存在');
    }

    if (invoice.status === InvoiceStatus.ISSUED && dto.status !== InvoiceStatus.ISSUED) {
      throw BusinessException.badRequest(
        ErrorCode.INVOICE_ORDER_INVALID,
        '已开票的申请不能回退，如需红冲请走线下',
      );
    }
    if (dto.status === InvoiceStatus.ISSUED && !dto.invoiceNo?.trim()) {
      throw BusinessException.badRequest(ErrorCode.INVOICE_ORDER_INVALID, '置为已开票必须填写发票号');
    }
    if (dto.status === InvoiceStatus.REJECTED && !dto.note?.trim()) {
      throw BusinessException.badRequest(ErrorCode.INVOICE_ORDER_INVALID, '驳回必须写明原因');
    }

    invoice.status = dto.status;
    invoice.invoiceNo = dto.invoiceNo?.trim() || invoice.invoiceNo;
    invoice.invoiceUrl = dto.invoiceUrl?.trim() || invoice.invoiceUrl;
    invoice.handleNote = dto.note?.trim() || null;
    invoice.handledBy = currentUser.userId;
    invoice.handledAt = new Date();

    return this.toDto(await this.invoiceRepository.save(invoice));
  }

  // ==================== 内部辅助 ====================

  private windowStart(): Date {
    const since = new Date();
    since.setDate(since.getDate() - INVOICE_APPLY_WINDOW_DAYS);
    return since;
  }

  private assertTitleShape(dto: UpsertInvoiceTitleDto): void {
    if (dto.kind === InvoiceTitleKind.ENTERPRISE && !dto.taxNo) {
      throw BusinessException.badRequest(
        ErrorCode.INVOICE_TITLE_NOT_FOUND,
        `${INVOICE_TITLE_KIND_LABELS[dto.kind]}抬头必须填写税号`,
      );
    }
  }

  private async findTitleOrFail(customerId: number, id: number): Promise<InvoiceTitle> {
    const title = await this.titleRepository.findOne({ where: { id, customerId } });
    if (!title) {
      throw BusinessException.notFound(ErrorCode.INVOICE_TITLE_NOT_FOUND, '发票抬头不存在');
    }
    return title;
  }

  private toTitleDto(title: InvoiceTitle): InvoiceTitleDto {
    const dto = new InvoiceTitleDto();
    dto.id = title.id;
    dto.kind = title.kind;
    dto.title = title.title;
    dto.taxNo = title.taxNo;
    dto.email = title.email;
    dto.isDefault = title.isDefault === 1;
    return dto;
  }

  private toDto(invoice: InvoiceApplication): InvoiceDto {
    const dto = new InvoiceDto();
    dto.id = invoice.id;
    dto.orderId = invoice.orderId;
    dto.orderNo = invoice.orderNo;
    dto.amount = invoice.amount;
    dto.kind = invoice.kind;
    dto.title = invoice.title;
    dto.taxNo = invoice.taxNo;
    dto.email = invoice.email;
    dto.status = invoice.status;
    dto.statusLabel = INVOICE_STATUS_LABELS[invoice.status];
    dto.invoiceNo = invoice.invoiceNo;
    dto.invoiceUrl = invoice.invoiceUrl;
    dto.remark = invoice.remark;
    dto.handleNote = invoice.handleNote;
    dto.createdAt = invoice.createdAt;
    dto.handledAt = invoice.handledAt;
    dto.storeId = invoice.storeId;
    dto.customerId = invoice.customerId;
    return dto;
  }
}
