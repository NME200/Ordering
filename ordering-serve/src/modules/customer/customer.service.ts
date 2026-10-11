import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomInt } from 'node:crypto';
import { In, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthCustomer } from '../../common/interfaces/auth-customer.interface';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { CouponScene } from '../../shared/enums/coupon.enum';
import { CustomerProfileDto } from './dto/customer-response.dto';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { REDIS_CLIENT, RedisKeys } from '../redis/redis.constants';
import { CouponService } from '../coupon/coupon.service';
import { MiniappConfigService } from '../miniapp/miniapp-config.service';
import { WechatApiError, WechatMiniappClient } from '../miniapp/wechat-miniapp.client';
import { CustomerTokenService } from './customer-token.service';
import { Customer } from './entities/customer.entity';
import { MemberProfile } from './entities/member-profile.entity';
import { MemberService } from './member.service';
import { CustomerCoupon } from '../coupon/entities/customer-coupon.entity';
import {
  BindPhoneDto,
  CustomerSessionDto,
  PHONE_PATTERN,
  UpdateCustomerProfileDto,
} from './dto/customer-auth.dto';
import { CustomerAdminRowDto, QueryCustomerAdminDto } from './dto/query-customer.dto';

/** 验证码有效期（秒） */
const SMS_CODE_TTL = 300;

/** 同一号码两次发送的最小间隔（秒） */
const SMS_SEND_INTERVAL = 60;

/** 邀请码字符集：去掉 I/O/0/1，避免口述和手抄混淆 */
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 微信侧错误码 → 顾客或运营听得懂的一句话。
 *
 * 只列实测会撞上的那几个，其余原样带出微信的 errmsg ——
 * 把未知错误翻成「登录失败，请重试」是最坏的做法：运营会一直重试到额度耗尽。
 */
const WECHAT_HINTS: Record<number, string> = {
  40013: 'AppID 不合法，请核对平台的小程序配置',
  40029: '登录凭据已失效，请重新进入小程序再试一次',
  40163: '这个授权码已经用过了，请重新点一次',
  45011: '操作过于频繁，请稍后再试',
  48001: '小程序未开通该能力：手机号验证需要在微信公众平台申请',
  1400001: '手机号验证额度已用完，请在小程序后台「付费管理」里续费',
};

/**
 * 顾客账号服务。
 *
 * 身份有三层，优先级 openid > visitorKey > phone：
 * 微信小程序里用 `wx.login` 的 code 换 openid，认的是**这个人**；
 * 换不到（H5、凭据没配、code 过期）就退回设备本地生成的 visitorKey，
 * 认的是**这台设备**。手机号是可选增强：不绑定也能有 ID、下单、攒积分。
 *
 * 一条硬规则：**微信侧的任何失败都不许挡住登录**。顾客进不来比账号认设备更糟。
 */
@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(MemberProfile)
    private readonly profileRepository: Repository<MemberProfile>,
    @InjectRepository(CustomerCoupon)
    private readonly couponRepository: Repository<CustomerCoupon>,
    private readonly tokens: CustomerTokenService,
    private readonly memberService: MemberService,
    private readonly couponService: CouponService,
    private readonly configService: ConfigService,
    private readonly miniappConfig: MiniappConfigService,
    private readonly wechat: WechatMiniappClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ==================== 静默注册与登录 ====================

  /**
   * 换一张顾客令牌。这是 C 端唯一的「登录」入口，且**必须幂等**。
   *
   * 带了 `wxCode` 就先认微信身份：同一个 openid 永远回到同一个账号，
   * 顾客换手机、删了重装都不会再出现「积分不见了」。
   * 换不到 openid 时整段跳过，退回 visitorKey 的老路子 —— 登录不能因为微信挂了而失败。
   */
  async session(dto: CustomerSessionDto): Promise<{
    accessToken: string;
    expiresIn: string;
    profile: CustomerProfileDto;
  }> {
    let customer = await this.customerRepository.findOne({ where: { visitorKey: dto.visitorKey } });
    let isNew = false;

    const openid = dto.wxCode ? await this.tryOpenid(dto.wxCode) : null;
    if (openid) {
      const byWechat = await this.customerRepository.findOne({ where: { openid } });
      if (byWechat) {
        if (customer && customer.id !== byWechat.id) {
          // 这台设备的本地账号和微信号不是同一个人：按微信账号登录。
          // 那个设备账号不并进来 —— 没有可靠依据判断哪个资产该归谁，抢过来只会说不清。
          this.logger.warn(
            `visitorKey ${dto.visitorKey} 与 openid 指向不同账号，按微信账号 ${byWechat.id} 登录`,
          );
        }
        customer = byWechat;
      } else if (customer) {
        await this.attachOpenid(customer, openid);
      } else {
        customer = await this.createCustomer(dto, openid);
        isNew = true;
      }
    }

    if (!customer) {
      customer = await this.createCustomer(dto, null);
      isNew = true;
    }

    if (customer.status !== CommonStatus.ENABLED) {
      throw new BusinessException(
        ErrorCode.CUSTOMER_TOKEN_INVALID,
        '账号已被停用，请联系客服',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!isNew) {
      await this.customerRepository.update({ id: customer.id }, { lastLoginAt: new Date() });
    }

    // 新客券在注册当场发，而不是等顾客进「我的」页再发：
    // 弹窗（popup-design 的 newcomer 类型）与领券中心都要能立刻看到它。
    if (isNew && dto.merchantId) {
      await this.couponService.autoIssue(customer.id, dto.merchantId, CouponScene.NEWCOMER);
    }

    const { accessToken, expiresIn } = await this.tokens.issue(customer);
    return { accessToken, expiresIn, profile: await this.buildProfile(customer.id) };
  }

  /** 建号。邀请码冲突（唯一索引）时重摇一次，不做循环重试 */
  private async createCustomer(dto: CustomerSessionDto, openid: string | null): Promise<Customer> {
    const inviter = dto.inviteCode
      ? await this.customerRepository.findOne({ where: { inviteCode: dto.inviteCode.toUpperCase() } })
      : null;

    const build = () =>
      this.customerRepository.create({
        visitorKey: dto.visitorKey,
        openid,
        inviteCode: this.randomInviteCode(),
        invitedBy: inviter ? inviter.id : null,
        registeredFromMerchantId: dto.merchantId ?? null,
        lastLoginAt: new Date(),
      });

    try {
      return await this.customerRepository.save(build());
    } catch (error) {
      if (!this.isDuplicate(error)) {
        throw error;
      }
      // 撞唯一索引 = 并发首登：openid 优先，其次设备号，都读不到就重摇一次
      const existed =
        (openid && (await this.customerRepository.findOne({ where: { openid } }))) ||
        (await this.customerRepository.findOne({ where: { visitorKey: dto.visitorKey } }));
      if (existed) {
        return existed;
      }
      return this.customerRepository.save(build());
    }
  }

  // ==================== 微信身份 ====================

  /**
   * 给已有登录态补绑微信身份。
   *
   * 存在的理由：老顾客本地已经存着令牌，`session` 这辈子不会再调一次，
   * 不补绑的话「换手机不丢账号」对存量账号永远是空话。
   */
  async bindWechatOpenid(customer: AuthCustomer, code: string): Promise<{ bound: boolean }> {
    const openid = await this.resolveOpenid(code);
    const row = await this.findByIdOrFail(customer.customerId);

    if (row.openid === openid) {
      return { bound: true };
    }
    const owner = await this.customerRepository.findOne({ where: { openid } });
    if (owner) {
      throw BusinessException.conflict(
        ErrorCode.CUSTOMER_WECHAT_FAILED,
        '这个微信号已经绑定过别的账号，请联系店员处理',
      );
    }
    if (!(await this.attachOpenid(row, openid))) {
      throw BusinessException.conflict(
        ErrorCode.CUSTOMER_WECHAT_FAILED,
        '这个微信号已经绑定过别的账号，请联系店员处理',
      );
    }
    return { bound: true };
  }

  /** code → openid。登录路径专用：任何失败只记日志，返回 null 让流程退回设备身份 */
  private async tryOpenid(code: string): Promise<string | null> {
    try {
      return await this.resolveOpenid(code);
    } catch (error) {
      this.logger.warn(`微信登录换 openid 失败，退回设备身份：${(error as Error).message}`);
      return null;
    }
  }

  /** code → openid。会抛错，供「必须真绑上」的路径使用 */
  private async resolveOpenid(code: string): Promise<string> {
    const { appId, appSecret } = await this.miniappCredentials();
    return this.callWechat(`微信登录`, async () => (await this.wechat.code2Session(appId, appSecret, code)).openid);
  }

  /** 把 openid 绑到账号上。回 false 表示这一瞬间被别的请求抢了（唯一索引挡住） */
  private async attachOpenid(customer: Customer, openid: string): Promise<boolean> {
    try {
      await this.customerRepository.update({ id: customer.id }, { openid });
      customer.openid = openid;
      return true;
    } catch (error) {
      if (!this.isDuplicate(error)) {
        throw error;
      }
      this.logger.warn(`openid 已被其他账号占用，顾客 ${customer.id} 维持设备身份`);
      return false;
    }
  }

  // ==================== 资料 ====================

  /** 当前顾客资料（含有效邀请人数） */
  async buildProfile(customerId: number): Promise<CustomerProfileDto> {
    const customer = await this.findByIdOrFail(customerId);
    return CustomerProfileDto.from(customer, await this.memberService.inviteCount(customerId));
  }

  async findByIdOrFail(customerId: number): Promise<Customer> {
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw BusinessException.notFound(ErrorCode.CUSTOMER_NOT_FOUND, '顾客账号不存在');
    }
    return customer;
  }

  /**
   * 修改资料。
   *
   * 生日走「只允许填一次」的规则：一旦库里已有值，传入不同值直接拒绝。
   * 这不是体验问题，是生日券能不能被重复领的问题。
   */
  async updateProfile(
    customerId: number,
    dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileDto> {
    const customer = await this.findByIdOrFail(customerId);

    if (dto.nickname !== undefined) {
      customer.nickname = dto.nickname.trim() || null;
    }
    if (dto.avatar !== undefined) {
      customer.avatar = dto.avatar.trim() || null;
    }
    if (dto.gender !== undefined) {
      customer.gender = dto.gender;
    }
    if (dto.birthday !== undefined) {
      if (customer.birthday && customer.birthday !== dto.birthday) {
        throw BusinessException.badRequest(
          ErrorCode.MEMBER_BIRTHDAY_LOCKED,
          '生日登记后不可修改，如需更正请联系客服',
        );
      }
      customer.birthday = dto.birthday;
    }

    await this.customerRepository.save(customer);
    return this.buildProfile(customerId);
  }

  // ==================== 手机号绑定 ====================

  /**
   * 发送短信验证码。
   *
   * **生产环境直接拒绝**：项目里没有任何短信通道，与其让顾客点「获取验证码」
   * 之后永远收不到，不如在这里就报「通道未接入」。
   * 非生产环境把验证码回显在响应里，联调能走通完整绑定链路。
   */
  async sendPhoneCode(phone: string): Promise<{ sent: boolean; devCode?: string }> {
    if (this.configService.getOrThrow<boolean>('app.isProduction')) {
      throw BusinessException.badRequest(
        ErrorCode.CUSTOMER_CODE_INVALID,
        '短信通道尚未接入，暂时无法在线绑定手机号',
      );
    }

    const intervalKey = RedisKeys.smsInterval(phone);
    const locked = await this.redis.set(intervalKey, '1', 'EX', SMS_SEND_INTERVAL, 'NX');
    if (!locked) {
      const ttl = await this.redis.ttl(intervalKey);
      throw new BusinessException(
        ErrorCode.CUSTOMER_CODE_TOO_MANY,
        `发送过于频繁，请 ${Math.max(ttl, 1)} 秒后再试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 6 位数字验证码。crypto.randomInt 而不是 Math.random：验证码不该可预测
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(RedisKeys.smsCode(phone), code, 'EX', SMS_CODE_TTL);

    this.logger.log(`[dev] 顾客绑定验证码 ${phone} → ${code}`);
    return { sent: true, devCode: code };
  }

  /**
   * 绑定手机号。
   *
   * 号码已被占用时**不区分「别人绑了」和「你自己换号」**，一律报冲突：
   * 前者必须挡住（否则可以抢注他人号码接管其资产），
   * 后者本轮没有解绑入口，需要走客服。
   */
  async bindPhone(customer: AuthCustomer, dto: BindPhoneDto): Promise<CustomerProfileDto> {
    const key = RedisKeys.smsCode(dto.phone);
    const expected = await this.redis.get(key);
    if (!expected || expected !== dto.code) {
      throw BusinessException.badRequest(ErrorCode.CUSTOMER_CODE_INVALID, '验证码错误或已过期');
    }
    await this.redis.del(key);

    return this.applyPhone(customer.customerId, dto.phone);
  }

  /**
   * 微信「手机号快速验证组件」一键绑定。
   *
   * 和短信通道的区别不是少输几个字，是**号码由微信背书**：
   * 顾客拿不到验证码，也就没法拿别人的号码抢注账号。
   * 这是扣费接口（0.03 元/次），所以 code 用掉就没了，失败只能让顾客重新点一次。
   */
  async bindPhoneByWechat(
    customer: AuthCustomer,
    code: string,
  ): Promise<CustomerProfileDto> {
    const { appId, appSecret } = await this.miniappCredentials();
    const accessToken = await this.callWechat('绑定手机号', () =>
      this.wechat.accessToken(appId, appSecret),
    );
    const info = await this.callWechat('绑定手机号', () => this.wechat.phoneNumber(accessToken, code));

    const phone = info.purePhoneNumber;
    if (!PHONE_PATTERN.test(phone)) {
      // 打码与「一个号码一个账号」的口径都按大陆 11 位写的，放国际号进来会两头错乱
      throw new BusinessException(
        ErrorCode.CUSTOMER_WECHAT_FAILED,
        `暂不支持 +${info.countryCode || '国际'} 手机号，请让店员手工登记`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.applyPhone(customer.customerId, phone);
  }

  /** 落库手机号。短信与微信两条通道共用同一套冲突规则 */
  private async applyPhone(customerId: number, phone: string): Promise<CustomerProfileDto> {
    const customerRow = await this.findByIdOrFail(customerId);
    if (customerRow.phone === phone) {
      return this.buildProfile(customerRow.id);
    }

    customerRow.phone = phone;
    customerRow.phoneBoundAt = new Date();
    try {
      await this.customerRepository.save(customerRow);
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw BusinessException.conflict(ErrorCode.CUSTOMER_PHONE_EXISTS, '该手机号已绑定其他账号');
      }
      throw error;
    }

    return this.buildProfile(customerRow.id);
  }

  /** 登出：只作废当前这一张令牌 */
  async logout(customer: AuthCustomer): Promise<void> {
    await this.tokens.revoke(customer.jti);
  }

  // ==================== 商户 / 平台侧 ====================

  /**
   * 顾客列表。
   *
   * 商户只能看**在本店有过会员档案或下过单**的人 —— 平台账号是全量的，
   * 没有 merchant 归属的顾客不出现在商户列表里，这是租户边界。
   */
  async paginateForStaff(
    query: QueryCustomerAdminDto,
    merchantId: number | null,
  ): Promise<PaginatedDto<CustomerAdminRowDto>> {
    const qb = this.customerRepository.createQueryBuilder('customer');

    if (merchantId !== null) {
      qb.innerJoin(
        MemberProfile,
        'profile',
        'profile.customer_id = customer.id AND profile.merchant_id = :merchantId',
        { merchantId },
      );
    }
    if (query.keyword) {
      qb.andWhere('(customer.phone LIKE :keyword OR customer.nickname LIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.status !== undefined) {
      qb.andWhere('customer.status = :status', { status: query.status });
    }

    qb.orderBy('customer.id', 'DESC').skip(query.skip).take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const profiles =
      merchantId === null
        ? new Map<number, MemberProfile>()
        : await this.memberService.profilesFor(
            rows.map((row) => row.id),
            merchantId,
          );

    const couponCounts = await this.countCoupons(rows.map((row) => row.id));

    return PaginatedDto.from({
      list: rows.map((row) =>
        CustomerAdminRowDto.from(
          row,
          profiles.get(row.id) ?? null,
          couponCounts.get(row.id) ?? 0,
          merchantId,
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** 封禁 / 解封顾客。封禁会自增会话版本号，手里的令牌立即全部失效 */
  async changeStatus(customerId: number, status: CommonStatus): Promise<void> {
    const customer = await this.findByIdOrFail(customerId);
    customer.status = status;
    if (status !== CommonStatus.ENABLED) {
      customer.tokenVersion += 1;
    }
    await this.customerRepository.save(customer);
  }

  /** 商户侧查看某位顾客在本商户的会员档案 */
  async memberProfile(customerId: number, merchantId: number): Promise<MemberProfile> {
    return this.memberService.getOrCreate(customerId, merchantId);
  }

  // ==================== 内部辅助 ====================

  /**
   * 取平台小程序凭据。
   *
   * 配置服务那句提示是写给「生成桌码」看的，这里换成顾客/运营在这条链路上
   * 真正该看到的话，原因（没填 / 主密钥换了导致解不开）仍然原样带出。
   */
  private async miniappCredentials(): Promise<{ appId: string; appSecret: string }> {
    try {
      const { appId, appSecret } = await this.miniappConfig.readCredentials();
      return { appId, appSecret };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw new BusinessException(
          ErrorCode.CUSTOMER_WECHAT_FAILED,
          `平台的小程序凭据不可用，暂时无法用微信登录：${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  /** 微信的报错统一翻成一句能行动的话；未知错误原样带出，别让运营对着「失败」猜 */
  private async callWechat<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof WechatApiError)) {
        throw error;
      }
      const hint = WECHAT_HINTS[error.errcode] ?? error.message.replace(/^微信接口 -?\d+：/, '');
      this.logger.warn(`${action}失败：${error.message}`);
      throw new BusinessException(ErrorCode.CUSTOMER_WECHAT_FAILED, `${action}失败：${hint}`, HttpStatus.BAD_REQUEST);
    }
  }

  /** 一次性算出多个顾客的可用券张数，避免列表页 N+1 */
  private async countCoupons(customerIds: number[]): Promise<Map<number, number>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    const rows = await this.couponRepository
      .createQueryBuilder('coupon')
      .select('coupon.customer_id', 'customerId')
      .addSelect('COUNT(*)', 'count')
      .where({ customerId: In(customerIds) })
      .andWhere('coupon.status = :status', { status: 'unused' })
      .andWhere('coupon.expire_at > :now', { now: new Date() })
      .groupBy('coupon.customer_id')
      .getRawMany<{ customerId: string; count: string }>();

    return new Map(rows.map((row) => [Number(row.customerId), Number(row.count)]));
  }

  private randomInviteCode(): string {
    return Array.from({ length: 6 }, () =>
      INVITE_CODE_ALPHABET.charAt(randomInt(0, INVITE_CODE_ALPHABET.length)),
    ).join('');
  }

  private isDuplicate(error: unknown): boolean {
    return (
      (error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
          'ER_DUP_ENTRY') ||
      (error as { code?: string })?.code === 'ER_DUP_ENTRY'
    );
  }
}
