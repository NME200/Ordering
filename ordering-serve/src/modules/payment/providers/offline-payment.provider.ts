import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../shared/enums/error-code.enum';
import { PaymentChannel } from '../../../shared/enums/payment-channel.enum';
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
 * 线下收款渠道（现金 / 收款码）。
 *
 * 没有「发起支付」与「回调」的概念 —— 商户收到钱后由系统直接落一张成功的支付单，
 * 因此这里把前两者实现为明确报错，只保留退款能力（现金退还）。
 *
 * 普通类：不需要任何凭据，由 PaymentProviderFactory 直接实例化。
 */
export class OfflinePaymentProvider implements PaymentProvider {
  readonly channel = PaymentChannel.OFFLINE;
  readonly online = false;

  prepay(_input: PrepayInput): Promise<PrepayResult> {
    throw BusinessException.badRequest(
      ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED,
      '线下收款不支持在线发起支付，请使用「标记线下收款」接口',
    );
  }

  verifyAndParseCallback(_input: CallbackInput): Promise<CallbackResult> {
    return Promise.resolve({
      success: false,
      paymentNo: '',
      transactionId: '',
      amount: 0,
      message: '线下收款渠道没有支付回调',
    });
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { success: true, refundTransactionId: `offline_refund_${input.refundNo}` };
  }
}
