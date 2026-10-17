import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, FindOptionsWhere, In, QueryFailedError, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  requireMerchantScope,
  resolveMerchantScope,
  resolveStoreScope,
} from '../../common/utils/tenant.util';
import { BusinessStatus } from '../../shared/enums/business-status.enum';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { DiningType } from '../../shared/enums/dining-type.enum';
import { DishStatus } from '../../shared/enums/dish-status.enum';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { OrderSource } from '../../shared/enums/order-source.enum';
import { ORDER_STATUS_VALUES, OrderStatus } from '../../shared/enums/order-status.enum';
import { SpecType } from '../../shared/enums/spec-type.enum';
import { SerialNoGenerator } from '../redis/serial-no.generator';
import { MerchantService } from '../merchant/merchant.service';
import { DishSpecGroup } from '../dish/entities/dish-spec-group.entity';
import { Dish } from '../dish/entities/dish.entity';
import { SpecGroup } from '../spec-group/entities/spec-group.entity';
import { SpecOption } from '../spec-group/entities/spec-option.entity';
import { CreatePaymentDto } from '../payment/dto/create-payment.dto';
import {
  PaymentResponseDto,
  PrepayResponseDto,
} from '../payment/dto/payment-response.dto';
import { PaymentService } from '../payment/payment.service';
import { Store } from '../store/entities/store.entity';
import { StoreDishService } from '../store-dish/store-dish.service';
import { StoreTableService } from '../store/store-table.service';
import { CouponService } from '../coupon/coupon.service';
import { CustomerAddress } from '../customer/entities/customer-address.entity';
import { assertOrderTransition } from './constants/order-status-flow';
import { MAX_ORDER_PAYABLE_CENT } from './constants/order-limits';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { OrderStatusCountDto } from './dto/order-status-count.dto';
import {
  OrderItemResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderItemSpec } from './entities/order-item-spec.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';

/** 单条明细的规格快照 */
interface SpecSnapshot {
  specGroupId: number;
  specGroupName: string;
  specOptionId: number;
  specOptionName: string;
  priceDiff: number;
}

/** 服务端计算出的明细草稿（金额已定，可直接落库） */
interface OrderItemDraft {
  dishId: number;
  dishName: string;
  dishImageUrl: string | null;
  unitPrice: number;
  specAmount: number;
  specSummary: string;
  quantity: number;
  subtotal: number;
  specs: SpecSnapshot[];
}

/** 落库入参：把「扫码下单」与「收银台开单」的差异都收敛到这里 */
interface PersistOrderInput {
  merchantId: number;
  storeId: number;
  drafts: OrderItemDraft[];
  clientToken: string | null;
  payToken: string;
  source: OrderSource;
  createdBy: number | null;
  createdByName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  tableNo: string | null;
  /** 就餐方式：只记录与展示，三种方式价格一致 */
  diningType: DiningType;
  remark: string | null;
  /** 下单顾客 ID；游客单与 POS 单为 null */
  customerId: number | null;
  /** 本单占用的顾客券 ID */
  couponId: number | null;
  /** 优惠金额（分）。由用券流程算出，POS 单恒为 0 */
  discountAmount: number;
  /** 收货信息快照（外卖单） */
  addressSnapshot: string | null;
}

/** 规格摘要文字上限，与 order_items.spec_summary 列长度保持一致 */
const SPEC_SUMMARY_MAX_LENGTH = 128;

/**
 * 订单服务。
 *
 * 三条硬约束：
 * 1. **金额只信服务端**：下单接口不接收任何价格字段，一律按菜品当前价 + 规格增量重算；
 * 2. **价格快照**：菜品名 / 图片 / 单价 / 规格名与增量在下单时全部落库，
 *    之后商户改价改菜名都不影响历史订单；
 * 3. **幂等**：client_token 唯一索引 + 前置查重，重复提交只产生一笔订单。
 *
 * 状态流转一律走 assertTransition，禁止直接赋值（见 constants/order-status-flow.ts）。
 */
@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(OrderItemSpec)
    private readonly orderItemSpecRepository: Repository<OrderItemSpec>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Dish)
    private readonly dishRepository: Repository<Dish>,
    @InjectRepository(DishSpecGroup)
    private readonly dishSpecGroupRepository: Repository<DishSpecGroup>,
    @InjectRepository(SpecGroup)
    private readonly specGroupRepository: Repository<SpecGroup>,
    @InjectRepository(SpecOption)
    private readonly specOptionRepository: Repository<SpecOption>,
    @InjectRepository(CustomerAddress)
    private readonly addressRepository: Repository<CustomerAddress>,
    private readonly dataSource: DataSource,
    private readonly serialNoGenerator: SerialNoGenerator,
    private readonly merchantService: MerchantService,
    private readonly paymentService: PaymentService,
    private readonly couponService: CouponService,
    // 门店有效菜单（标准值 + 本店例外）—— 与列表页共用同一处合并口径
    private readonly storeDishService: StoreDishService,
    // 台位清单：桌号不再由顾客手填，扫码带出来的值要能对上本店在用的台位
    private readonly storeTableService: StoreTableService,
  ) {}

  // ==================== 下单 ====================

  /**
   * 创建订单（C 端扫码点餐）。
   *
   * 租户上下文来自 storeId（扫码解析得到），无操作人。
   * 幂等查重必须带商户条件，否则会把他租户的订单返回给当前调用方。
   *
   * `customer` 来自 OptionalCustomerGuard：带了有效令牌就归属到账号（能进「我的订单」、
   * 能用券、能攒积分），没带就是游客单，链路照常走完。
   */
  async create(dto: CreateOrderDto, customer?: AuthCustomer): Promise<OrderResponseDto> {
    const store = await this.resolveOpenStore(dto.storeId);
    await this.assertTableUsable(store.id, dto.diningType ?? DiningType.DINE_IN, dto.tableNo);

    const existing = await this.findByClientToken(dto.clientToken, store.merchantId);
    if (existing) {
      return this.toResponse(existing, true);
    }

    const drafts = await this.buildItemDrafts(dto.items, store.merchantId, store.id);
    const totalAmount = drafts.reduce((sum, draft) => sum + draft.subtotal, 0);

    const addressSnapshot = await this.resolveAddressSnapshot(dto, customer);

    /**
     * 用券：先锁券再落单。
     *
     * 顺序不能反 —— 先落单再锁券的话，两个并发请求都能通过券的可用性检查，
     * 一张券抵两笔单。锁券失败（已被占用 / 门槛不够）直接报错，此时还没有订单产生。
     */
    let couponId: number | null = null;
    let discountAmount = 0;
    if (dto.couponId) {
      if (!customer) {
        throw BusinessException.badRequest(
          ErrorCode.COUPON_NOT_USABLE,
          '登录后才能使用优惠券',
        );
      }
      const locked = await this.couponService.lockForOrder(
        customer.customerId,
        store.merchantId,
        dto.couponId,
        totalAmount,
      );
      couponId = locked.coupon.id;
      discountAmount = locked.discountAmount;
    }

    try {
      return await this.persistOrder({
        merchantId: store.merchantId,
        storeId: store.id,
        drafts,
        clientToken: dto.clientToken ?? null,
        payToken: randomUUID(),
        source: OrderSource.SCAN,
        createdBy: null,
        createdByName: null,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        tableNo: dto.tableNo ?? null,
        diningType: dto.diningType ?? DiningType.DINE_IN,
        remark: dto.remark ?? null,
        customerId: customer?.customerId ?? null,
        couponId,
        discountAmount,
        addressSnapshot,
      });
    } catch (error) {
      // 单子没落成，券必须还回去，否则顾客白白丢一张券
      if (couponId !== null) {
        await this.couponService.releaseById(couponId);
      }
      throw error;
    }
  }

  /**
   * 收银台代客开单（POS）。
   *
   * 与扫码下单共用同一套算价与落库逻辑，差别只在：
   * - 租户与门店取自 **Token**（收银员不能跨店开单；商户管理员下辖多门店，须显式指定）；
   * - 订单记录**操作人**（created_by / created_by_name），便于对账与追责；
   * - **打烊门店仍允许开单**（线下是否接单由收银员判断），只校验门店是否启用。
   *
   * 开出的单为「待支付」，收款走 `POST /orders/:id/offline-pay`（现金）或 `/pay`（在线支付）。
   */
  async createPos(dto: CreatePosOrderDto, currentUser: AuthUser): Promise<OrderResponseDto> {
    const operatorMerchantId = requireMerchantScope(currentUser);

    const existing = await this.findByClientToken(dto.clientToken, operatorMerchantId);
    if (existing) {
      return this.toResponse(existing, true);
    }

    const store = await this.resolvePosStore(currentUser, dto.storeId);
    const drafts = await this.buildItemDrafts(dto.items, store.merchantId, store.id);

    return this.persistOrder({
      merchantId: store.merchantId,
      storeId: store.id,
      drafts,
      clientToken: dto.clientToken ?? null,
      payToken: randomUUID(),
      source: OrderSource.POS,
      createdBy: currentUser.userId,
      createdByName: currentUser.nickname,
      customerName: dto.customerName ?? null,
      customerPhone: dto.customerPhone ?? null,
      tableNo: dto.tableNo ?? null,
      diningType: DiningType.DINE_IN,
      remark: dto.remark ?? null,
      // POS 单是收银员替到店客人开的：没有顾客账号，也不走线上券
      customerId: null,
      couponId: null,
      discountAmount: 0,
      addressSnapshot: null,
    });
  }

  // ==================== 查询 ====================

  /** 分页查询订单（商户端） */
  async paginate(
    query: QueryOrderDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<OrderResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.orderRepository.createQueryBuilder('order');
    if (merchantId !== null) {
      qb.andWhere('order.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('order.storeId = :storeId', { storeId });
    }
    if (query.status !== undefined) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.diningType !== undefined) {
      qb.andWhere('order.diningType = :diningType', { diningType: query.diningType });
    }
    if (query.keyword) {
      // 取餐码必须能搜：顾客在柜台前报的就是它，店员拿它找不到单，这个号就白发了
      qb.andWhere(
        '(order.orderNo LIKE :keyword OR order.customerPhone LIKE :keyword OR order.pickupCode LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }
    if (query.startTime) {
      qb.andWhere('order.createdAt >= :startTime', { startTime: new Date(query.startTime) });
    }
    if (query.endTime) {
      qb.andWhere('order.createdAt <= :endTime', { endTime: new Date(query.endTime) });
    }

    qb.orderBy('order.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();

    return PaginatedDto.from({
      list: await this.toResponseList(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 查询订单详情（商户端，带租户 / 门店范围校验） */
  async findOne(id: number, currentUser: AuthUser): Promise<OrderResponseDto> {
    return this.toResponse(await this.findByIdOrFail(id, currentUser));
  }

  /** 订单状态计数（商户端概览） */
  async statusSummary(
    currentUser: AuthUser,
    requestedMerchantId?: number,
    requestedStoreId?: number,
  ): Promise<OrderStatusCountDto[]> {
    const merchantId = resolveMerchantScope(currentUser, requestedMerchantId);
    const storeId = resolveStoreScope(currentUser, requestedStoreId);

    const qb = this.orderRepository
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('order.status');

    if (merchantId !== null) {
      qb.andWhere('order.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('order.storeId = :storeId', { storeId });
    }

    const rows = await qb.getRawMany<{ status: string | number; count: string }>();
    const countByStatus = new Map<number, number>();
    for (const row of rows) {
      countByStatus.set(Number(row.status), Number(row.count));
    }

    return ORDER_STATUS_VALUES.map((status) =>
      OrderStatusCountDto.from(status, countByStatus.get(status) ?? 0),
    );
  }

  /** 按 ID 查询订单，带租户 / 门店范围校验（越权访问返回 404） */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<Order> {
    const merchantId = resolveMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser);

    const where: FindOptionsWhere<Order> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }
    if (storeId !== null) {
      where.storeId = storeId;
    }

    const order = await this.orderRepository.findOne({ where });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    return order;
  }

  // ==================== 状态流转 ====================

  /**
   * 发起在线支付（C 端扫码点餐后调用）。
   *
   * 实际流程编排在 PaymentService，这里只做转发，让 Controller 只依赖自身 Service。
   */
  async createPayment(orderId: number, dto: CreatePaymentDto): Promise<PrepayResponseDto> {
    return this.paymentService.createPayment(orderId, dto);
  }

  /** 标记线下收款（现金 / 收款码），直接置为已支付 */
  async payOffline(orderId: number, currentUser: AuthUser): Promise<PaymentResponseDto> {
    return this.paymentService.payOffline(orderId, currentUser);
  }

  /** 商户接单 */
  async accept(id: number, currentUser: AuthUser): Promise<OrderResponseDto> {
    return this.transition(id, OrderStatus.PREPARING, currentUser, (order) => {
      order.acceptedAt = new Date();
    });
  }

  /** 出餐 */
  async markReady(id: number, currentUser: AuthUser): Promise<OrderResponseDto> {
    return this.transition(id, OrderStatus.READY, currentUser, (order) => {
      order.readyAt = new Date();
    });
  }

  /** 完成（用户取餐 / 商户点完成） */
  async complete(id: number, currentUser: AuthUser): Promise<OrderResponseDto> {
    return this.transition(id, OrderStatus.COMPLETED, currentUser, (order) => {
      order.completedAt = new Date();
    });
  }

  /**
   * 取消订单 / 拒单。
   *
   * 已支付（或制作中）的订单会**先发起退款，退款成功才落「已取消」**；
   * 退款失败则整体失败，避免出现「订单取消了但钱没退」。
   */
  async cancel(
    id: number,
    dto: CancelOrderDto,
    currentUser: AuthUser,
  ): Promise<OrderResponseDto> {
    const order = await this.findByIdOrFail(id, currentUser);
    assertOrderTransition(order.status, OrderStatus.CANCELLED);

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.PREPARING) {
      await this.paymentService.refundByOrder(order.id, dto.reason ?? '订单取消自动退款');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelReason = dto.reason ?? null;

    await this.orderRepository.save(order);
    // 券要跟着退：钱退了、券还锁着，等于顾客白丢一张券
    await this.couponService.releaseByOrder(order.id);
    return this.toResponse(order);
  }

  /**
   * 顾客取消自己的订单。
   *
   * **只允许取消未支付的单**。商户侧 `cancel` 会先退款再落取消，那是有权限的经营者动作；
   * 顾客自助退款等于把退款变成一个无需审批的公开接口，所以已支付的单一律引导找门店，
   * 由门店走 `order:cancel` / `payment:refund`。
   */
  async cancelByCustomer(id: number, customerId: number): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({ where: { id, customerId } });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_STATUS_INVALID,
        '这一单已经支付或已流转，需要退款请联系门店',
      );
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelReason = '顾客取消';
    await this.orderRepository.save(order);
    await this.couponService.releaseByOrder(order.id);
    return this.toResponse(order);
  }

  // ==================== 内部辅助 ====================

  /** 统一的状态流转：校验 → 打补丁 → 落库 */
  private async transition(
    id: number,
    target: OrderStatus,
    currentUser: AuthUser,
    patch: (order: Order) => void,
  ): Promise<OrderResponseDto> {
    const order = await this.findByIdOrFail(id, currentUser);
    assertOrderTransition(order.status, target);

    order.status = target;
    patch(order);

    await this.orderRepository.save(order);
    return this.toResponse(order);
  }

  /** 幂等第一道：令牌已用过则返回原订单（必须带商户条件，避免跨租户命中） */
  private async findByClientToken(
    clientToken: string | undefined,
    merchantId: number,
  ): Promise<Order | null> {
    if (!clientToken) {
      return null;
    }
    return this.orderRepository.findOne({ where: { clientToken, merchantId } });
  }

  /**
   * 落库：订单 + 明细 + 规格快照，全部包在一个事务里。
   * 扫码下单与收银台开单共用这一段，保证两条链路的算价与快照行为完全一致。
   */
  private async persistOrder(input: PersistOrderInput): Promise<OrderResponseDto> {
    const { drafts } = input;
    const totalAmount = drafts.reduce((sum, draft) => sum + draft.subtotal, 0);
    const itemCount = drafts.reduce((sum, draft) => sum + draft.quantity, 0);
    const discountAmount = input.discountAmount;
    const payableAmount = totalAmount - discountAmount;

    /**
     * 金额上限校验必须在落库之前。
     * 金额列是 MySQL `int`（上限 2147483647 分 ≈ 2147 万元），
     * 行数 × 份数 × 单价即使每行都合法，累计仍可能溢出并让 INSERT 直接抛 500；
     * 在这里拦成可读的 400，而不是让调用方看到一个天书般的 10000。
     */
    if (payableAmount <= 0) {
      throw BusinessException.badRequest(ErrorCode.ORDER_AMOUNT_INVALID, '订单应付金额必须大于 0');
    }
    if (payableAmount > MAX_ORDER_PAYABLE_CENT) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_AMOUNT_INVALID,
        `订单应付金额超出上限（${MAX_ORDER_PAYABLE_CENT / 100} 元），请拆单后下单`,
      );
    }

    /**
     * 自提单当场发取餐码。
     *
     * 只给自提：堂食有桌号、外卖有地址，多一个号只会多一个能念错的口径。
     * 下单就发、不等接单 —— 顾客付完款就把这一屏当凭证，出餐前改号等于把凭证作废。
     */
    const pickupCode =
      input.diningType === DiningType.PICKUP
        ? String(await this.serialNoGenerator.nextSeq(`pickup-${input.storeId}`)).padStart(4, '0')
        : null;

    let orderId: number;
    try {
      orderId = await this.dataSource.transaction(async (manager) => {
        const orderRepository = manager.getRepository(Order);
        const order = await orderRepository.save(
          orderRepository.create({
            orderNo: await this.serialNoGenerator.next('O'),
            clientToken: input.clientToken,
            payToken: input.payToken,
            merchantId: input.merchantId,
            storeId: input.storeId,
            source: input.source,
            createdBy: input.createdBy,
            createdByName: input.createdByName,
            status: OrderStatus.PENDING_PAYMENT,
            totalAmount,
            discountAmount,
            payableAmount,
            paidAmount: null,
            itemCount,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            tableNo: input.tableNo,
            pickupCode,
            diningType: input.diningType,
            remark: input.remark,
            customerId: input.customerId,
            couponId: input.couponId,
            addressSnapshot: input.addressSnapshot,
            paidAt: null,
            acceptedAt: null,
            readyAt: null,
            completedAt: null,
            cancelledAt: null,
            cancelReason: null,
          }),
        );

        const itemRepository = manager.getRepository(OrderItem);
        const specRepository = manager.getRepository(OrderItemSpec);

        for (const draft of drafts) {
          const item = await itemRepository.save(
            itemRepository.create({
              orderId: order.id,
              merchantId: input.merchantId,
              dishId: draft.dishId,
              dishName: draft.dishName,
              dishImageUrl: draft.dishImageUrl,
              unitPrice: draft.unitPrice,
              specAmount: draft.specAmount,
              specSummary: draft.specSummary,
              quantity: draft.quantity,
              subtotal: draft.subtotal,
            }),
          );

          if (draft.specs.length > 0) {
            await specRepository.save(
              draft.specs.map((spec) =>
                specRepository.create({
                  orderItemId: item.id,
                  merchantId: input.merchantId,
                  specGroupId: spec.specGroupId,
                  specGroupName: spec.specGroupName,
                  specOptionId: spec.specOptionId,
                  specOptionName: spec.specOptionName,
                  priceDiff: spec.priceDiff,
                }),
              ),
            );
          }
        }

        return order.id;
      });
    } catch (error) {
      // 幂等第二道：并发下同一 (商户, 令牌) 只有一笔能落库，另一笔命中联合唯一索引
      if (input.clientToken && this.isDuplicateEntry(error)) {
        const existed = await this.findByClientToken(input.clientToken, input.merchantId);
        if (existed) {
          return this.toResponse(existed, true);
        }
      }
      throw error;
    }

    if (input.couponId !== null) {
      // 券与订单建立关联：支付成功要按 orderId 核销，取消要按 orderId 退回
      await this.couponService.attachOrder(input.couponId, orderId);
    }

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    return this.toResponse(order, true);
  }

  /**
   * 解析代客开单的门店。
   *
   * - 收银员 / 门店管理员：门店强制取自 Token（`resolveStoreScope` 会忽略前端传值）；
   * - 商户管理员：下辖多门店，必须显式指定；
   * - 与 C 端不同，**打烊门店仍允许开单** —— 线下是否接单由收银员人工判断。
   */
  private async resolvePosStore(currentUser: AuthUser, requestedStoreId?: number): Promise<Store> {
    const merchantId = requireMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser, requestedStoreId);

    if (storeId === null) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_STORE_REQUIRED,
        '当前账号下辖多个门店，请指定下单门店',
      );
    }

    const store = await this.storeRepository.findOne({ where: { id: storeId, merchantId } });
    if (!store) {
      throw BusinessException.notFound(ErrorCode.ORDER_STORE_CLOSED, '门店不存在');
    }
    if (store.status !== CommonStatus.ENABLED) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STORE_CLOSED, '门店已停用，无法开单');
    }
    return store;
  }

  /**
   * 外卖单的收货信息快照。
   *
   * 只在 `diningType = 外卖配送` 时生效。没传 addressId 时退化成「称呼 + 手机号」，
   * 那是本轮之前就存在的行为，不能因为加了地址功能就把老客户端的下单堵死。
   */
  /**
   * 堂食单的桌号校验。
   *
   * 桌号改成「只能由桌上的二维码带出来」之后，这里就是它唯一的真值来源：
   * - 为空放行 —— 没扫码照样能下单，由店员现场安排，不为难顾客；
   * - 非空但对不上（贴错桌、旧码没撕、桌位已撤）就拒 —— 拒的是把餐端到错桌，不是生意。
   *
   * 只卡 C 端扫码单：收银台 POS 单的桌号是店员按现场填的，
   * 拿后台台位去拦店员，只会变成「桌子没录进系统就不给开单」。
   */
  private async assertTableUsable(
    storeId: number,
    diningType: DiningType,
    tableNo?: string,
  ): Promise<void> {
    const no = (tableNo ?? '').trim();
    if (diningType !== DiningType.DINE_IN || !no) return;
    if (await this.storeTableService.isUsable(storeId, no)) return;
    throw BusinessException.badRequest(
      ErrorCode.STORE_TABLE_UNUSABLE,
      `桌面二维码上的桌号「${no}」在本店不存在或已停用，请让店员确认这张码`,
    );
  }

  private async resolveAddressSnapshot(
    dto: CreateOrderDto,
    customer?: AuthCustomer,
  ): Promise<string | null> {
    if (dto.diningType !== DiningType.DELIVERY) {
      return null;
    }
    if (!dto.addressId) {
      return dto.customerName && dto.customerPhone
        ? `${dto.customerName} ${dto.customerPhone}`
        : null;
    }
    if (!customer) {
      throw BusinessException.badRequest(
        ErrorCode.ADDRESS_NOT_FOUND,
        '登录后才能使用保存的收货地址',
      );
    }
    const address = await this.addressRepository.findOne({
      where: { id: dto.addressId, customerId: customer.customerId },
    });
    if (!address) {
      throw BusinessException.notFound(ErrorCode.ADDRESS_NOT_FOUND, '收货地址不存在');
    }
    return `${address.receiverName} ${address.phone} ${address.province}${address.city}${address.district}${address.detail}`;
  }

  /** 解析门店并校验可下单（门店存在 + 所属商户可用 + 门店启用 + 营业中） */
  private async resolveOpenStore(storeId: number): Promise<Store> {
    const store = await this.storeRepository.findOne({ where: { id: storeId } });
    if (!store) {
      throw BusinessException.notFound(ErrorCode.ORDER_STORE_CLOSED, '门店不存在');
    }

    /**
     * C 端下单是公开接口、不走 JwtStrategy，所以「商户已被平台禁用 / 已到期」
     * 这一层必须在这里补上，否则被停服的租户还能继续收单。
     * 这里刻意不包装异常：禁用 / 到期与缓存故障必须能区分开，
     * 不能把 Redis 故障伪装成「商户暂停服务」而静默拒掉全部下单。
     */
    await this.merchantService.assertUsableForRequest(store.merchantId);

    if (store.status !== CommonStatus.ENABLED) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STORE_CLOSED, '门店已停用，暂不支持下单');
    }
    if (store.businessStatus !== BusinessStatus.OPEN) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STORE_CLOSED, '门店已打烊，暂不支持下单');
    }
    return store;
  }

  /**
   * 依据菜单与所选规格，在服务端计算每一条明细的价格。
   *
   * 这是下单链路的核心：菜品是否可售、规格是否合法、金额多少，全部在这里判定，
   * 前端只提供「菜品 ID + 数量 + 规格项 ID」。
   *
   * 可售与价格都按**门店有效值**算（商户标准菜单 + 本店例外），
   * 与列表页共用 `StoreDishService.resolveEffective`，避免出现
   * 「列表说在售、下单说停售」这种两套口径的分裂。
   */
  private async buildItemDrafts(
    items: CreateOrderItemDto[],
    merchantId: number,
    storeId: number,
  ): Promise<OrderItemDraft[]> {
    const dishIds = [...new Set(items.map((item) => item.dishId))];

    const dishes = await this.dishRepository.find({ where: { id: In(dishIds), merchantId } });
    const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
    const overrides = await this.storeDishService.loadOverrides(storeId, dishIds);

    const links = await this.dishSpecGroupRepository.find({ where: { dishId: In(dishIds) } });
    const groupIdsByDish = new Map<number, number[]>();
    for (const link of links) {
      const list = groupIdsByDish.get(link.dishId) ?? [];
      list.push(link.specGroupId);
      groupIdsByDish.set(link.dishId, list);
    }

    const allGroupIds = [...new Set(links.map((link) => link.specGroupId))];
    const groups =
      allGroupIds.length > 0
        ? await this.specGroupRepository.find({ where: { id: In(allGroupIds), merchantId } })
        : [];
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const options =
      allGroupIds.length > 0
        ? await this.specOptionRepository.find({
            where: { groupId: In(allGroupIds), merchantId, status: CommonStatus.ENABLED },
          })
        : [];
    const optionById = new Map(options.map((option) => [option.id, option]));

    const drafts: OrderItemDraft[] = [];

    for (const item of items) {
      const dish = dishById.get(item.dishId);
      if (!dish) {
        throw BusinessException.badRequest(
          ErrorCode.ORDER_DISH_UNAVAILABLE,
          `菜品 ${item.dishId} 不存在或不属于该商户`,
        );
      }
      // 店专属菜只能从归属店下单，别的店即使知道 ID 也下不了
      if (dish.storeId !== null && dish.storeId !== storeId) {
        throw BusinessException.badRequest(
          ErrorCode.ORDER_DISH_UNAVAILABLE,
          `菜品「${dish.name}」在本店不售卖`,
        );
      }

      const effective = this.storeDishService.resolveEffective(dish, overrides.get(dish.id));
      if (!effective.onSale) {
        // 三种原因分开报，收银员才解释得清；商户全局下架压过门店例外，故放在最前
        const reason =
          dish.status !== DishStatus.ON_SHELF
            ? '已下架，请刷新菜单后重试'
            : effective.soldOut
              ? '已售罄（本店沽清）'
              : '本店已停售';
        throw BusinessException.badRequest(
          ErrorCode.ORDER_DISH_UNAVAILABLE,
          `菜品「${dish.name}」${reason}`,
        );
      }

      const dishGroupIds = groupIdsByDish.get(dish.id) ?? [];
      const selectedOptions: SpecOption[] = [];

      for (const optionId of item.specOptionIds ?? []) {
        const option = optionById.get(optionId);
        if (!option || !dishGroupIds.includes(option.groupId)) {
          throw BusinessException.badRequest(
            ErrorCode.ORDER_SPEC_INVALID,
            `规格项 ${optionId} 不属于菜品「${dish.name}」`,
          );
        }
        selectedOptions.push(option);
      }

      const selectedByGroup = new Map<number, SpecOption[]>();
      for (const option of selectedOptions) {
        const list = selectedByGroup.get(option.groupId) ?? [];
        list.push(option);
        selectedByGroup.set(option.groupId, list);
      }

      for (const groupId of dishGroupIds) {
        const group = groupById.get(groupId);
        // 规格组被停用时视为不生效，跳过校验
        if (!group || group.status !== CommonStatus.ENABLED) {
          continue;
        }
        const chosen = selectedByGroup.get(groupId) ?? [];
        if (group.isRequired && chosen.length === 0) {
          throw BusinessException.badRequest(
            ErrorCode.ORDER_SPEC_INVALID,
            `菜品「${dish.name}」的「${group.name}」为必选规格`,
          );
        }
        if (group.type === SpecType.SINGLE && chosen.length > 1) {
          throw BusinessException.badRequest(
            ErrorCode.ORDER_SPEC_INVALID,
            `菜品「${dish.name}」的「${group.name}」只能选一项`,
          );
        }
      }

      const specAmount = selectedOptions.reduce((sum, option) => sum + option.priceDiff, 0);
      // 门店价（若有）压过标准价；规格增量仍按商户层计
      const unitAmount = effective.price + specAmount;

      /**
       * 每行「菜品价 + 规格增量」必须为正。
       * 这是负金额订单的总闸：0 元菜 + 负增量能算出一行负数小计，
       * 订单一旦落成就是一张负额单，再走线下收款会落出一张负数支付单。
       */
      if (unitAmount <= 0) {
        throw BusinessException.badRequest(
          ErrorCode.ORDER_AMOUNT_INVALID,
          `菜品「${dish.name}」所选规格后的单价必须大于 0`,
        );
      }

      const subtotal = unitAmount * item.quantity;

      drafts.push({
        dishId: dish.id,
        dishName: dish.name,
        dishImageUrl: dish.imageUrl,
        unitPrice: effective.price,
        specAmount,
        specSummary: this.buildSpecSummary(selectedOptions, dishGroupIds),
        quantity: item.quantity,
        subtotal,
        specs: selectedOptions.map((option) => {
          const group = groupById.get(option.groupId);
          return {
            specGroupId: option.groupId,
            specGroupName: group ? group.name : '',
            specOptionId: option.id,
            specOptionName: option.name,
            priceDiff: option.priceDiff,
          };
        }),
      });
    }

    return drafts;
  }

  /** 按菜品上的规格组顺序拼出规格摘要，如「大杯 / 加珍珠」 */
  private buildSpecSummary(options: SpecOption[], groupOrder: number[]): string {
    const sorted = [...options].sort(
      (a, b) => groupOrder.indexOf(a.groupId) - groupOrder.indexOf(b.groupId),
    );
    const summary = sorted.map((option) => option.name).join(' / ');

    return summary.length > SPEC_SUMMARY_MAX_LENGTH
      ? `${summary.slice(0, SPEC_SUMMARY_MAX_LENGTH - 3)}...`
      : summary;
  }

  /**
   * 单笔订单转出参（含明细与规格快照）。
   *
   * withPayToken 仅在**下单链路**为 true：支付票据是一次性归属凭证，
   * 列表与详情带上它等于把「替别人发起支付」的能力发给了所有能看到订单的人。
   */
  private async toResponse(order: Order, withPayToken = false): Promise<OrderResponseDto> {
    const [dto] = await this.toResponseList([order], withPayToken);
    return dto;
  }

  /** 批量订单转出参：一次性把明细与规格查出来，避免 N+1 */
  private async toResponseList(
    orders: Order[],
    withPayToken = false,
  ): Promise<OrderResponseDto[]> {
    if (orders.length === 0) {
      return [];
    }

    const items = await this.orderItemRepository.find({
      where: { orderId: In(orders.map((order) => order.id)) },
      order: { id: 'ASC' },
    });

    const itemIds = items.map((item) => item.id);
    const specs =
      itemIds.length > 0
        ? await this.orderItemSpecRepository.find({
            where: { orderItemId: In(itemIds) },
            order: { id: 'ASC' },
          })
        : [];

    const specsByItem = new Map<number, OrderItemSpec[]>();
    for (const spec of specs) {
      const list = specsByItem.get(spec.orderItemId) ?? [];
      list.push(spec);
      specsByItem.set(spec.orderItemId, list);
    }

    const itemsByOrder = new Map<number, OrderItemResponseDto[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(OrderItemResponseDto.from(item, specsByItem.get(item.id) ?? []));
      itemsByOrder.set(item.orderId, list);
    }

    return orders.map((order) =>
      OrderResponseDto.from(order, itemsByOrder.get(order.id) ?? [], withPayToken),
    );
  }

  /** 判断是否为 MySQL 唯一索引冲突 */
  private isDuplicateEntry(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
        'ER_DUP_ENTRY'
    );
  }
}
