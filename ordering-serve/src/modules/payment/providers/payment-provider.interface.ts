import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';

/** 发起支付入参 */
export interface PrepayInput {
  /** 支付单号 */
  paymentNo: string;
  /** 订单号（渠道侧展示用） */
  orderNo: string;
  /** 支付金额（分） */
  amount: number;
  /** 商品描述 */
  description: string;
  /** 微信支付需要的用户 openid，其他渠道忽略 */
  openId?: string;
}

/** 发起支付结果 */
export interface PrepayResult {
  /** 渠道预支付 ID */
  prepayId: string;
  /** 返回给客户端用于唤起支付的参数（结构由各渠道定义） */
  payParams: Record<string, unknown>;
}

/** 支付回调入参 */
export interface CallbackInput {
  /** 原始请求体（真实渠道的验签必须用原文，不能是重新序列化的对象） */
  rawBody: string;
  /** 请求头（微信支付需要用到 Wechatpay-Signature 等） */
  headers: Record<string, string | string[] | undefined>;
  /** 解析后的回调体 */
  payload: Record<string, unknown>;
}

/** 支付回调解析结果 */
export interface CallbackResult {
  /** 验签是否通过 */
  success: boolean;
  /**
   * 报文合法、但这件事与「推进支付单」无关（真实渠道的退款结果通知就是这样）。
   *
   * 必须单独确认收到：按验签失败回 4xx 的话，渠道会按退避策略把同一条通知
   * 重推到一天以上，日志里全是假警报。
   */
  ignore?: boolean;
  /** 支付单号 */
  paymentNo: string;
  /** 渠道交易流水号 */
  transactionId: string;
  /** 渠道回传的支付金额（分），用于与支付单核对 */
  amount: number;
  /** 失败原因 */
  message?: string;
}

/** 退款入参 */
export interface RefundInput {
  paymentNo: string;
  /** 原支付流水号 */
  transactionId: string | null;
  /** 退款单号 */
  refundNo: string;
  /** 退款金额（分） */
  amount: number;
  reason: string;
}

/** 退款结果 */
export interface RefundResult {
  success: boolean;
  /** 渠道侧退款流水号 */
  refundTransactionId: string;
  message?: string;
}

/**
 * 支付渠道抽象。
 *
 * 新增渠道（如微信支付）只需实现本接口并在 PaymentProviderRegistry 注册，
 * 支付主流程与订单模块都无需改动。
 */
export interface PaymentProvider {
  /** 渠道标识 */
  readonly channel: PaymentChannel;

  /** 是否为「在线」渠道（可被 C 端用于发起支付）。线下收款为 false */
  readonly online: boolean;

  /** 向渠道下单，获取预支付信息 */
  prepay(input: PrepayInput): Promise<PrepayResult>;

  /**
   * 生成一份已通过验签的回调报文（可选能力）。
   *
   * 只有联调渠道该实现 —— 用于非生产环境的「模拟支付成功」接口，
   * 让签名始终留在服务端。真实渠道不实现本方法。
   */
  buildCallbackBody?(paymentNo: string, amount: number): Record<string, unknown>;

  /** 校验并解析渠道回调 */
  verifyAndParseCallback(input: CallbackInput): Promise<CallbackResult>;

  /** 发起退款 */
  refund(input: RefundInput): Promise<RefundResult>;
}
