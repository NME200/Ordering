import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
import { hmacSha256Hex, safeCompare } from '../utils/sign.util';
import {
  CallbackInput,
  CallbackResult,
  PaymentProvider,
  PrepayInput,
  PrepayResult,
  RefundInput,
  RefundResult,
} from './payment-provider.interface';

/**
 * 模拟支付渠道。
 *
 * 用于本地联调与自动化测试：**验签逻辑与真实渠道一致**（HMAC-SHA256），
 * 因此回调的安全校验链路是被真实执行的，而不是被跳过。
 *
 * 签名算法：
 * ```
 * 待签名串 = `${paymentNo}&${amount}&${transactionId}`
 * sign     = HMAC-SHA256(待签名串, 渠道密钥) 的 hex
 * ```
 *
 * ⚠️ 签名**绝不下发给客户端**：payParams 里带 sign 等于把服务端的信任根交给调用方，
 * 任何人都能用它自助把任意订单「支付成功」。联调时的模拟支付改走
 * `POST /payments/dev/mock-pay`（仅非生产环境注册，签名在服务端本地生成）。
 *
 * 普通类而非 @Injectable：密钥来自数据库里的支付配置，由 PaymentProviderFactory
 * 按配置实例化，这样才能在平台改完密钥后不重启直接生效。
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly channel = PaymentChannel.MOCK;
  readonly online = true;

  constructor(private readonly secret: string) {}

  /** 拼接待签名串 */
  private buildSignSource(paymentNo: string, amount: number, transactionId: string): string {
    return `${paymentNo}&${amount}&${transactionId}`;
  }

  /** 渠道侧交易号由支付单号推导，真实渠道则由回调带回 */
  private buildTransactionId(paymentNo: string): string {
    return `mock_txn_${paymentNo}`;
  }

  async prepay(input: PrepayInput): Promise<PrepayResult> {
    return {
      prepayId: `mock_prepay_${input.paymentNo}`,
      payParams: {
        channel: this.channel,
        paymentNo: input.paymentNo,
        orderNo: input.orderNo,
        amount: input.amount,
        callbackUrl: `/api/v1/payments/callback/${this.channel}`,
        tip: '开发联调：调用 POST /payments/dev/mock-pay 模拟渠道支付成功（该接口在生产环境不可用）',
      },
    };
  }

  /**
   * 在服务端生成一份「已通过验签」的回调报文，仅供非生产环境的模拟支付接口使用。
   * 真实渠道没有这一步 —— 报文只可能来自渠道服务器。
   */
  buildCallbackBody(paymentNo: string, amount: number): Record<string, unknown> {
    const transactionId = this.buildTransactionId(paymentNo);
    return {
      paymentNo,
      amount,
      transactionId,
      sign: hmacSha256Hex(this.buildSignSource(paymentNo, amount, transactionId), this.secret),
    };
  }

  async verifyAndParseCallback(input: CallbackInput): Promise<CallbackResult> {
    const paymentNo = String(input.payload.paymentNo ?? '');
    const transactionId = String(input.payload.transactionId ?? '');
    const amount = Number(input.payload.amount);
    const sign = String(input.payload.sign ?? '');

    if (!paymentNo || !transactionId || !Number.isFinite(amount) || !sign) {
      return {
        success: false,
        paymentNo,
        transactionId,
        amount: 0,
        message: '回调参数不完整（需 paymentNo / amount / transactionId / sign）',
      };
    }

    const expected = hmacSha256Hex(
      this.buildSignSource(paymentNo, amount, transactionId),
      this.secret,
    );
    if (!safeCompare(expected, sign)) {
      return { success: false, paymentNo, transactionId, amount, message: '回调签名校验失败' };
    }

    return { success: true, paymentNo, transactionId, amount };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { success: true, refundTransactionId: `mock_refund_${input.refundNo}` };
  }
}
