import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { resolveMerchantScope, resolveStoreScope } from '../../common/utils/tenant.util';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { ServiceSender, ServiceSessionStatus } from '../../shared/enums/service.enum';
import { maskPhone } from '../../shared/utils/mask.util';
import { Customer } from '../customer/entities/customer.entity';
import { Order } from '../order/entities/order.entity';
import { ServiceMessage } from './entities/service-message.entity';
import { ServiceSession } from './entities/service-session.entity';
import {
  QueryServiceSessionDto,
  ServiceMessageDto,
  ServiceSessionDto,
  StaffReplyDto,
} from './dto/service.dto';

/** 会话列表预览长度 */
const PREVIEW_LENGTH = 60;

/**
 * 在线客服服务。
 *
 * 一个顾客在一个商户下**只有一条会话**，反复进入接着聊。
 * 未读数分两端记（customerUnread / staffUnread），因为「对方看了没有」
 * 只有对方自己的读操作知道，用一张 read_at 字段推两边会互相打架。
 */
@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(ServiceSession)
    private readonly sessionRepository: Repository<ServiceSession>,
    @InjectRepository(ServiceMessage)
    private readonly messageRepository: Repository<ServiceMessage>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  // ==================== 顾客侧 ====================

  /** 打开（或复用）与某商户的会话 */
  async openByCustomer(
    customerId: number,
    merchantId: number,
    storeId?: number,
  ): Promise<ServiceSessionDto> {
    const session = await this.findOrCreate(customerId, merchantId, storeId ?? null);
    return this.toSessionDto(session, 'customer');
  }

  /** 顾客发消息 */
  async sendByCustomer(
    customerId: number,
    merchantId: number,
    content: string,
    orderId?: number,
    storeId?: number,
  ): Promise<ServiceMessageDto> {
    const session = await this.findOrCreate(customerId, merchantId, storeId ?? null);

    let orderNo: string | null = null;
    if (orderId) {
      const order = await this.orderRepository.findOne({ where: { id: orderId, customerId } });
      orderNo = order?.orderNo ?? null;
    }

    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    const senderName = customer?.nickname?.trim() || `食客${String(customerId).slice(-4)}`;

    return this.append(session, ServiceSender.CUSTOMER, customerId, senderName, content, orderNo);
  }

  /** 轮询拉取新消息，并把客服侧发来的消息标记为已读 */
  async pollByCustomer(
    customerId: number,
    sessionId: number,
    afterId: number,
  ): Promise<{ messages: ServiceMessageDto[]; session: ServiceSessionDto }> {
    const session = await this.findSessionOrFail(sessionId);
    if (session.customerId !== customerId) {
      throw BusinessException.notFound(ErrorCode.SERVICE_SESSION_NOT_FOUND, '会话不存在');
    }

    const messages = await this.messageRepository.find({
      where: { sessionId },
      order: { id: 'ASC' },
    });
    const fresh = messages.filter((message) => message.id > afterId);

    const hasStaffReply = fresh.some((message) => message.sender === ServiceSender.STAFF);
    if (hasStaffReply || session.customerUnread > 0) {
      session.customerUnread = 0;
      if (session.status === ServiceSessionStatus.REPLIED) {
        session.status = ServiceSessionStatus.OPEN;
      }
      await this.sessionRepository.save(session);
    }

    return {
      messages: fresh.map((message) => this.toMessageDto(message)),
      session: this.toSessionDto(session, 'customer'),
    };
  }

  // ==================== 商户侧 ====================

  async paginateForStaff(
    query: QueryServiceSessionDto,
    currentUser: AuthUser,
  ): Promise<PaginatedDto<ServiceSessionDto>> {
    const merchantId = resolveMerchantScope(currentUser);
    const storeId = resolveStoreScope(currentUser, query.storeId);

    const qb = this.sessionRepository.createQueryBuilder('session');
    if (merchantId !== null) {
      qb.andWhere('session.merchant_id = :merchantId', { merchantId });
    }
    if (storeId !== null) {
      qb.andWhere('session.store_id = :storeId', { storeId });
    }
    if (query.status !== undefined) {
      qb.andWhere('session.status = :status', { status: query.status });
    }
    qb.orderBy('session.last_message_at', 'DESC').addOrderBy('session.id', 'DESC');
    qb.skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const names = await this.customerNames(rows.map((row) => row.customerId));

    return PaginatedDto.from({
      list: rows.map((row) => {
        const dto = this.toSessionDto(row, 'staff');
        const found = names.get(row.customerId);
        dto.customerName = found?.nickname ?? `食客${String(row.customerId).slice(-4)}`;
        dto.customerPhone = maskPhone(found?.phone ?? null);
        return dto;
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async detailForStaff(
    sessionId: number,
    currentUser: AuthUser,
  ): Promise<{ messages: ServiceMessageDto[]; session: ServiceSessionDto }> {
    const session = await this.findScopedSession(sessionId, currentUser);
    const messages = await this.messageRepository.find({
      where: { sessionId },
      order: { id: 'ASC' },
      take: 200,
    });

    if (session.staffUnread > 0) {
      session.staffUnread = 0;
      session.status = ServiceSessionStatus.REPLIED;
      await this.sessionRepository.save(session);
    }

    return {
      messages: messages.map((message) => this.toMessageDto(message)),
      session: this.toSessionDto(session, 'staff'),
    };
  }

  /** 客服回复 */
  async reply(sessionId: number, dto: StaffReplyDto, currentUser: AuthUser): Promise<ServiceMessageDto> {
    const session = await this.findScopedSession(sessionId, currentUser);
    return this.append(
      session,
      ServiceSender.STAFF,
      currentUser.userId,
      currentUser.nickname || '客服',
      dto.content,
      null,
    );
  }

  async close(sessionId: number, currentUser: AuthUser): Promise<void> {
    const session = await this.findScopedSession(sessionId, currentUser);
    session.status = ServiceSessionStatus.CLOSED;
    await this.sessionRepository.save(session);
  }

  // ==================== 内部辅助 ====================

  private async findOrCreate(
    customerId: number,
    merchantId: number,
    storeId: number | null,
  ): Promise<ServiceSession> {
    const existing = await this.sessionRepository.findOne({ where: { customerId, merchantId } });
    if (existing) {
      // 顾客换了门店来咨询时更新上下文，但会话本身不换，历史必须连着
      if (storeId && existing.storeId !== storeId) {
        existing.storeId = storeId;
        return this.sessionRepository.save(existing);
      }
      return existing;
    }
    try {
      return await this.sessionRepository.save(
        this.sessionRepository.create({
          customerId,
          merchantId,
          storeId,
          status: ServiceSessionStatus.OPEN,
        }),
      );
    } catch (error) {
      if (this.isDuplicate(error)) {
        const row = await this.sessionRepository.findOne({ where: { customerId, merchantId } });
        if (row) {
          return row;
        }
      }
      throw error;
    }
  }

  /**
   * 追加一条消息并维护会话冗余字段。
   *
   * 未读数加在**对方**那一侧：客服发的消息顾客还没看，就涨 customerUnread。
   */
  private async append(
    session: ServiceSession,
    sender: ServiceSender,
    senderId: number,
    senderName: string,
    content: string,
    orderNo: string | null,
  ): Promise<ServiceMessageDto> {
    const saved = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        sender,
        senderId,
        senderName,
        content: content.trim(),
        orderNo,
      }),
    );

    session.lastMessage = saved.content.slice(0, PREVIEW_LENGTH);
    session.lastMessageAt = saved.createdAt ?? new Date();
    if (sender === ServiceSender.CUSTOMER) {
      session.staffUnread += 1;
      session.status = ServiceSessionStatus.OPEN;
    } else {
      session.customerUnread += 1;
      session.status = ServiceSessionStatus.REPLIED;
    }
    await this.sessionRepository.save(session);

    return this.toMessageDto(saved);
  }

  private async findSessionOrFail(id: number): Promise<ServiceSession> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw BusinessException.notFound(ErrorCode.SERVICE_SESSION_NOT_FOUND, '会话不存在');
    }
    return session;
  }

  /** 商户侧取会话：越租户一律 404，不暴露「这条会话存在但不是你的」 */
  private async findScopedSession(id: number, currentUser: AuthUser): Promise<ServiceSession> {
    const merchantId = resolveMerchantScope(currentUser);
    const session = await this.findSessionOrFail(id);
    if (merchantId !== null && session.merchantId !== merchantId) {
      throw BusinessException.notFound(ErrorCode.SERVICE_SESSION_NOT_FOUND, '会话不存在');
    }
    return session;
  }

  private async customerNames(ids: number[]): Promise<Map<number, Customer>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.customerRepository.find({ where: unique.map((id) => ({ id })) });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private toSessionDto(session: ServiceSession, side: 'customer' | 'staff'): ServiceSessionDto {
    const dto = new ServiceSessionDto();
    dto.id = session.id;
    dto.merchantId = session.merchantId;
    dto.storeId = session.storeId;
    dto.orderId = session.orderId;
    dto.status = session.status;
    dto.lastMessage = session.lastMessage;
    dto.lastMessageAt = session.lastMessageAt;
    dto.unread = side === 'customer' ? session.customerUnread : session.staffUnread;
    return dto;
  }

  private toMessageDto(message: ServiceMessage): ServiceMessageDto {
    const dto = new ServiceMessageDto();
    dto.id = message.id;
    dto.sender = message.sender;
    dto.senderName = message.senderName;
    dto.content = message.content;
    dto.orderNo = message.orderNo;
    dto.createdAt = message.createdAt;
    return dto;
  }

  private isDuplicate(error: unknown): boolean {
    return (
      (error as { driverError?: { code?: string } })?.driverError?.code === 'ER_DUP_ENTRY' ||
      (error as { code?: string })?.code === 'ER_DUP_ENTRY'
    );
  }
}
