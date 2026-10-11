import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { resolveMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import {
  ORDER_STATUS_LABELS,
  OrderStatus,
} from '../../shared/enums/order-status.enum';
import {
  PAYMENT_CHANNEL_VALUES,
  PaymentChannel,
} from '../../shared/enums/payment-channel.enum';
import {
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../../shared/enums/payment-status.enum';
import { RefundStatus } from '../../shared/enums/refund-status.enum';
import { Order } from '../order/entities/order.entity';
import { CouponService } from '../coupon/coupon.service';
import { MemberService } from '../customer/member.service';
import { SerialNoGenerator } from '../redis/serial-no.generator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PaymentChannelDto,
  PaymentResponseDto,
  PrepayResponseDto,
} from './dto/payment-response.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Payment } from './entities/payment.entity';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { CallbackInput, RefundResult } from './providers/payment-provider.interface';
import { safeCompare } from './utils/sign.util';

/** 支付单号前缀 */
const PAYMENT_NO_PREFIX = 'P';
/** 退款单号前缀 */
const REFUND_NO_PREFIX = 'R';

/**
 * 支付服务。
 *
 * 设计要点：
 * 1. **渠道可插拔**：所有渠道差异收敛在 PaymentProvider 实现里，本服务只编排流程；
 * 2. **回调幂等**：渠道会重复推送，已成功的支付单直接返回，不重复改订单；
 * 3. **金额核对**：回调金额必须与支付单一致，防止被篡改；
 * 4. **失败关闭**：订单取消时先退款成功再落「已取消」，退款失败则整体失败。
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly registry: PaymentProviderRegistry,
    private readonly serialNoGenerator: SerialNoGenerator,
    private readonly memberService: MemberService,
    private readonly couponService: CouponService,
  ) {}

  // ==================== 渠道信息 ====================

  /** 可用支付渠道（供前端展示；online=true 的才可被 C 端用于发起支付） */
  listChannels(): PaymentChannelDto[] {
    return this.registry
      .all()
      .map((provider) => PaymentChannelDto.from(provider.channel, provider.online));
  }

  // ==================== 发起支付 ====================

  /**
   * 发起在线支付（C 端扫码点餐后调用，**公开接口**）。
   *
   * 归属校验：调用方必须出示下单时拿到的 payToken。否则任何人只要枚举自增的订单 ID，
   * 就能给别家商户的订单发起支付、甚至推进它的状态。
   * 票据缺失或不匹配一律返回「订单不存在」，不暴露订单是否存在。
   *
   * 同一订单在同一渠道下已有待支付单时直接复用，避免用户反复点击生成一堆支付单。
   */
  async createPayment(orderId: number, dto: CreatePaymentDto): Promise<PrepayResponseDto> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order?.payToken || !safeCompare(order.payToken, dto.payToken)) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    return this.startPayment(order, dto.channel ?? PaymentChannel.MOCK, dto.openId);
  }

  /**
   * 已登录顾客为自己的订单发起支付。
   *
   * payToken 是一次性票据，只在下单响应里出现一次，**换设备或清过缓存的顾客手里没有它**，
   * 于是那笔没付的单子就永远付不了。这条路径改用 `orders.customer_id` 与令牌里的顾客 ID
   * 相等来证明归属 —— 强度不低于双因子，且完全不给未登录者开口子。
   */
  async createPaymentForOwner(
    orderId: number,
    customerId: number,
    channel: PaymentChannel,
  ): Promise<PrepayResponseDto> {
    const order = await this.orderRepository.findOne({ where: { id: orderId, customerId } });
    if (!order) {
      throw BusinessException.notFound(ErrorCode.ORDER_NOT_FOUND, '订单不存在');
    }
    return this.startPayment(order, channel);
  }

  /** 归属确认之后共用的下单流程 */
  private async startPayment(
    order: Order,
    channel: PaymentChannel,
    openId?: string,
  ): Promise<PrepayResponseDto> {
    const provider = this.registry.get(channel);
    this.assertPayable(order);

    let payment = await this.paymentRepository.findOne({
      where: { orderId: order.id, channel, status: PaymentStatus.PENDING },
    });

    if (!payment) {
      payment = await this.paymentRepository.save(
        this.paymentRepository.create({
          paymentNo: await this.serialNoGenerator.next(PAYMENT_NO_PREFIX),
          orderId: order.id,
          orderNo: order.orderNo,
          merchantId: order.merchantId,
          storeId: order.storeId,
          channel,
          status: PaymentStatus.PENDING,
          amount: order.payableAmount,
          transactionId: null,
          prepayId: null,
          paidAt: null,
          closedAt: null,
          failReason: null,
          refundNo: null,
          refundStatus: RefundStatus.NONE,
          refundAmount: null,
          refundedAt: null,
          refundReason: null,
          refundTransactionId: null,
        }),
      );
    }

    try {
      const prepay = await provider.prepay({
        paymentNo: payment.paymentNo,
        orderNo: order.orderNo,
        amount: payment.amount,
        description: `订单 ${order.orderNo}`,
        openId,
      });

      payment.prepayId = prepay.prepayId;
      await this.paymentRepository.save(payment);

      return PrepayResponseDto.from(payment, prepay.payParams);
    } catch (error) {
      // 渠道下单失败：把支付单标记为失败，避免留下一张永远待支付的僵尸单
      payment.status = PaymentStatus.FAILED;
      payment.failReason = error instanceof Error ? error.message : String(error);
      await this.paymentRepository.save(payment);
      throw error;
    }
  }

  // ==================== 支付回调 ====================

  /**
   * 处理支付渠道回调（第三方服务器调用，无登录态）。
   *
   * 安全依赖渠道验签；幂等依赖「已成功直接返回」。
   */
  async handleCallback(channel: PaymentChannel, input: CallbackInput): Promise<PaymentResponseDto> {
    const provider = this.registry.get(channel);
    const parsed = await provider.verifyAndParseCallback(input);

    if (!parsed.success) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_SIGN_INVALID,
        parsed.message ?? '支付回调验签失败',
      );
    }

    const payment = await this.paymentRepository.findOne({
      where: { paymentNo: parsed.paymentNo },
    });
    if (!payment) {
      throw BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, '支付单不存在');
    }

    // 幂等：渠道会重复推送同一笔回调
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`支付回调重复到达，已忽略：${payment.paymentNo}`);
      return PaymentResponseDto.from(payment);
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_STATUS_INVALID,
        `支付单当前为「${PAYMENT_STATUS_LABELS[payment.status]}」，无法确认支付`,
      );
    }
    if (parsed.amount !== payment.amount) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_AMOUNT_MISMATCH,
        `回调金额 ${parsed.amount} 与支付单金额 ${payment.amount} 不一致`,
      );
    }

    let orderAlreadyClosed = false;
    let paidOrderId: number | null = null;

    await this.dataSource.transaction(async (manager) => {
      payment.status = PaymentStatus.SUCCESS;
      payment.transactionId = parsed.transactionId;
      payment.paidAt = new Date();
      await manager.getRepository(Payment).save(payment);

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({ where: { id: payment.orderId } });
      if (!order) {
        return;
      }

      // 极端情况：用户取消订单的同时支付成功 —— 不能改订单状态，转为自动退款
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        orderAlreadyClosed = true;
        return;
      }

      order.status = OrderStatus.PAID;
      order.paidAt = payment.paidAt;
      order.paidAmount = payment.amount;
      await orderRepository.save(order);

      // 积分与成长值必须在同一个事务里累计：
      // 订单已支付但积分没到账，顾客会来问；反过来积分到账而订单回滚，就是白送。
      await this.memberService.accrueForPaidOrder(order, manager);
      paidOrderId = order.id;
    });

    if (orderAlreadyClosed) {
      this.logger.warn(
        `支付单 ${payment.paymentNo} 回调时订单已非待支付状态，发起自动退款`,
      );
      await this.refundPaymentRecord(payment, '订单已取消，支付成功后自动退款');
      return PaymentResponseDto.from(payment);
    }

    if (paidOrderId !== null) {
      await this.couponService.markUsedByOrder(paidOrderId);
    }

    this.logger.log(`支付成功：${payment.paymentNo}，订单 ${payment.orderNo}`);
    return PaymentResponseDto.from(payment);
  }

  /**
   * 模拟渠道支付成功（联调专用，路由由 DevOnlyGuard 拦住生产环境）。
   *
   * 报文与签名都在服务端生成后直接喂给回调主流程，**签名从不出服务端**，
   * 因此联调走的是与真实渠道完全相同的验签 + 幂等链路。
   */
  async simulateOnlinePayment(
    channel: PaymentChannel,
    paymentNo: string,
  ): Promise<PaymentResponseDto> {
    const provider = this.registry.get(channel);
    if (!provider.buildCallbackBody) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED,
        `渠道「${channel}」不支持模拟支付`,
      );
    }

    const payment = await this.paymentRepository.findOne({ where: { paymentNo } });
    if (!payment) {
      throw BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, '支付单不存在');
    }

    const payload = provider.buildCallbackBody(payment.paymentNo, payment.amount);
    return this.handleCallback(channel, {
      rawBody: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      payload,
    });
  }

  // ==================== 线下收款 ====================

  /** 标记线下收款（现金 / 收款码）：直接落一张成功的支付单并推进订单状态 */
  async payOffline(orderId: number, currentUser: AuthUser): Promise<PaymentResponseDto> {
    const order = await this.findOrderOrFail(orderId, currentUser);
    this.assertPayable(order);

    const result = await this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).save(
        manager.getRepository(Payment).create({
          paymentNo: await this.serialNoGenerator.next(PAYMENT_NO_PREFIX),
          orderId: order.id,
          orderNo: order.orderNo,
          merchantId: order.merchantId,
          storeId: order.storeId,
          channel: PaymentChannel.OFFLINE,
          status: PaymentStatus.SUCCESS,
          amount: order.payableAmount,
          transactionId: `offline_${order.orderNo}`,
          prepayId: null,
          paidAt: new Date(),
          closedAt: null,
          failReason: null,
          refundNo: null,
          refundStatus: RefundStatus.NONE,
          refundAmount: null,
          refundedAt: null,
          refundReason: null,
          refundTransactionId: null,
        }),
      );

      order.status = OrderStatus.PAID;
      order.paidAt = payment.paidAt;
      order.paidAmount = payment.amount;
      await manager.getRepository(Order).save(order);
      await this.memberService.accrueForPaidOrder(order, manager);

      this.logger.log(`线下收款成功：${payment.paymentNo}，订单 ${payment.orderNo}`);
      return PaymentResponseDto.from(payment);
    });

    await this.couponService.markUsedByOrder(order.id);
    return result;
  }

  // ==================== 退款 ====================

  /** 手动发起退款（商户端） */
  async refund(
    id: number,
    dto: RefundPaymentDto,
    currentUser: AuthUser,
  ): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(id, currentUser);
    return this.refundPaymentRecord(payment, dto.reason ?? '商户发起退款');
  }

  /**
   * 按订单退款（供订单取消流程调用）。
   *
   * 未支付或已退款时静默返回，不阻断取消流程。
   */
  async refundByOrder(orderId: number, reason?: string): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: {
        orderId,
        status: PaymentStatus.SUCCESS,
        refundStatus: RefundStatus.NONE,
      },
      order: { id: 'DESC' },
    });
    if (!payment) {
      return;
    }
    await this.refundPaymentRecord(payment, reason ?? '订单取消自动退款');
  }

  // ==================== 查询 ====================

  /** 分页查询支付流水（商户端） */
  async paginate(
    query: QueryPaymentDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<PaymentResponseDto>> {
    const merchantId = resolveMerchantScope(currentUser, query.merchantId);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.paymentRepository.createQueryBuilder('payment');
    if (merchantId !== null) {
      qb.andWhere('payment.merchantId = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('payment.storeId = :storeId', { storeId });
    }
    if (query.orderId !== undefined) {
      qb.andWhere('payment.orderId = :orderId', { orderId: query.orderId });
    }
    if (query.channel !== undefined) {
      qb.andWhere('payment.channel = :channel', { channel: query.channel });
    }
    if (query.status !== undefined) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }
    if (query.keyword) {
      qb.andWhere('(payment.paymentNo LIKE :keyword OR payment.orderNo LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.startTime) {
      qb.andWhere('payment.createdAt >= :startTime', { startTime: new Date(query.startTime) });
    }
    if (query.endTime) {
      qb.andWhere('payment.createdAt <= :endTime', { endTime: new Date(query.endTime) });
    }

    qb.orderBy('payment.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return PaginatedDto.from({
      list: rows.map((row) => PaymentResponseDto.from(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 查询支付单详情 */
  async findOne(id: number, currentUser: AuthUser): Promise<PaymentResponseDto> {
    return PaymentResponseDto.from(await this.findByIdOrFail(id, currentUser));
  }

  /** 按 ID 查询支付单，带租户 / 门店范围校验 */
  async findByIdOrFail(id: number, currentUser: AuthUser): Promise<Payment> {
    const merchantId = resolveMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser);

    const where: FindOptionsWhere<Payment> = { id };
    if (merchantId !== null) {
      where.merchantId = merchantId;
    }
    if (storeId !== null) {
      where.storeId = storeId;
    }

    const payment = await this.paymentRepository.findOne({ where });
    if (!payment) {
      throw BusinessException.notFound(ErrorCode.PAYMENT_NOT_FOUND, '支付单不存在');
    }
    return payment;
  }

  // ==================== 内部辅助 ====================

  /** 校验订单可支付：必须是待支付状态 */
  private assertPayable(order: Order): void {
    if (order.status === OrderStatus.PAID) {
      throw BusinessException.badRequest(ErrorCode.ORDER_STATUS_INVALID, '订单已支付，请勿重复操作');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw BusinessException.badRequest(
        ErrorCode.ORDER_STATUS_INVALID,
        `订单当前为「${ORDER_STATUS_LABELS[order.status]}」，无法发起支付`,
      );
    }
  }

  /** 按 ID 查询订单，带租户 / 门店范围校验 */
  private async findOrderOrFail(orderId: number, currentUser: AuthUser): Promise<Order> {
    const merchantId = resolveMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser);

    const where: FindOptionsWhere<Order> = { id: orderId };
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

  /**
   * 调用渠道退款并更新支付单的退款信息。
   *
   * **必须原子认领**：退款是「读状态 → 调渠道 → 写状态」的跨网络过程，
   * 只靠进入方法时看一眼 refundStatus，两个并发请求（连点两次、
   * 商户手动退款与订单取消自动退款同时发生）都会读到 NONE、都会去调渠道，
   * 同一笔钱就被退两次，而库里只会留下最后一个退款单号 —— 账目直接对不上。
   *
   * 做法是先用一条带条件的 UPDATE 把 refund_status 从 NONE/FAILED 抢成 PENDING，
   * 只有 affected === 1 的那个请求才有权调用渠道。
   * 认领成功后若进程崩溃，支付单会停在 PENDING 并阻止后续退款 ——
   * 这是刻意选择的失败方向：**宁可卡住一笔待人工处理的退款，也不能重复出款**。
   */
  private async refundPaymentRecord(payment: Payment, reason: string): Promise<PaymentResponseDto> {
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_REFUND_NOT_ALLOWED,
        `支付单当前为「${PAYMENT_STATUS_LABELS[payment.status]}」，不可退款`,
      );
    }

    const provider = this.registry.get(payment.channel);
    const refundNo = await this.serialNoGenerator.next(REFUND_NO_PREFIX);

    const claim = await this.paymentRepository.update(
      {
        id: payment.id,
        status: PaymentStatus.SUCCESS,
        refundStatus: In([RefundStatus.NONE, RefundStatus.FAILED]),
      },
      { refundStatus: RefundStatus.PENDING, refundNo, refundReason: reason },
    );

    if (claim.affected !== 1) {
      // 没抢到认领：读一次真实状态，给出准确提示而不是含糊的「请勿重复操作」
      const current = await this.paymentRepository.findOneByOrFail({ id: payment.id });
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_REFUND_NOT_ALLOWED,
        current.refundStatus === RefundStatus.SUCCESS
          ? '该支付单已退款，请勿重复操作'
          : current.refundStatus === RefundStatus.PENDING
            ? '该支付单退款处理中，请勿重复操作'
            : '该支付单当前不可退款',
      );
    }

    payment.refundStatus = RefundStatus.PENDING;
    payment.refundNo = refundNo;
    payment.refundReason = reason;

    let result: RefundResult;
    try {
      result = await provider.refund({
        paymentNo: payment.paymentNo,
        transactionId: payment.transactionId,
        refundNo,
        amount: payment.amount,
        reason,
      });
    } catch (error) {
      // 渠道调用抛错也必须把认领状态落回 FAILED，否则这张单永远卡在 PENDING
      await this.paymentRepository.update(
        { id: payment.id, refundStatus: RefundStatus.PENDING, refundNo },
        { refundStatus: RefundStatus.FAILED },
      );
      payment.refundStatus = RefundStatus.FAILED;
      throw error;
    }

    // 只回写自己这一次认领（带上 refundNo 条件），避免覆盖别人的退款结果
    if (result.success) {
      await this.paymentRepository.update(
        { id: payment.id, refundStatus: RefundStatus.PENDING, refundNo },
        {
          refundStatus: RefundStatus.SUCCESS,
          refundAmount: payment.amount,
          refundedAt: new Date(),
          refundTransactionId: result.refundTransactionId,
        },
      );
      payment.refundStatus = RefundStatus.SUCCESS;
      payment.refundAmount = payment.amount;
      payment.refundedAt = new Date();
      payment.refundTransactionId = result.refundTransactionId;

      // 退款成功要扣回这一单发的积分与成长值（幂等由 point_logs 唯一索引保证）
      const refundedOrder = await this.orderRepository.findOne({
        where: { id: payment.orderId },
      });
      if (refundedOrder) {
        await this.memberService.reverseForRefund(refundedOrder);
      }
    } else {
      await this.paymentRepository.update(
        { id: payment.id, refundStatus: RefundStatus.PENDING, refundNo },
        { refundStatus: RefundStatus.FAILED },
      );
      payment.refundStatus = RefundStatus.FAILED;
    }

    if (!result.success) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_REFUND_FAILED,
        result.message ?? '退款失败',
      );
    }

    this.logger.log(`退款成功：支付单 ${payment.paymentNo}，退款单号 ${refundNo}`);
    return PaymentResponseDto.from(payment);
  }

  /** 校验并规范化渠道参数 */
  resolveChannel(raw: string): PaymentChannel {
    if (!PAYMENT_CHANNEL_VALUES.includes(raw as PaymentChannel)) {
      throw BusinessException.badRequest(
        ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED,
        `不支持的支付渠道：${raw}`,
      );
    }
    return raw as PaymentChannel;
  }
}
