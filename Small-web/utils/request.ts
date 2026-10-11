import { BASE_URL } from '@/config/env';
import { ErrorCode } from '@/types/error-codes';
import { clearCustomerToken, getCustomerToken } from '@/utils/auth';

/** 后端统一信封：`{ code, message, data }`，code 0 为成功 */
interface Envelope<T> {
  code: number;
  message: string;
  data: T | null;
}

/**
 * 顾客令牌失效的业务码。
 *
 * 10002 未登录 / 100001 账号不存在 / 100002 令牌不合法：
 * 命中这几个就把本地令牌清掉，下一次进页面会重新静默注册。
 * 不清的话，顾客被封禁或换过设备后每个请求都稳定 401，界面永远转圈。
 */
const TOKEN_DEAD_CODES = new Set<number>([10002, 100001, 100002]);

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  /** 不弹 toast：轮询与「失败态自己画」的接口用 */
  silent?: boolean;
  timeout?: number;
}

/**
 * 业务错误。
 *
 * `code` 是后端的业务码（不是 HTTP 状态），前端要按它分流的地方都判这个：
 * 10006 要退避、40001 要进「扫码失效」页、80004/80005 要重载菜单。
 */
export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 微信 toast 只显示两行，长文案（后端会把缺失项列全）截断后交给页面自己展示 */
function notify(message: string): void {
  uni.showToast({
    title: message.length > 32 ? `${message.slice(0, 32)}…` : message,
    icon: 'none',
    duration: 2500,
  });
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const token = getCustomerToken();
    uni.request({
      url: `${BASE_URL}${path}`,
      method: options.method ?? 'GET',
      data: options.data,
      timeout: options.timeout ?? 10000,
      header: {
        'Content-Type': 'application/json',
        // 匿名接口带着也无妨：后端 @Public() 分支不看这个头，顾客接口靠它认人
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        const body = res.data as Envelope<T> | null;
        const ok = res.statusCode >= 200 && res.statusCode < 300 && body?.code === ErrorCode.SUCCESS;
        if (ok) {
          resolve(body!.data as T);
          return;
        }
        if (TOKEN_DEAD_CODES.has(body?.code ?? -1)) clearCustomerToken();
        const error = new ApiError(
          body?.code ?? ErrorCode.UNKNOWN,
          body?.message || `请求失败（HTTP ${res.statusCode}）`,
          res.statusCode,
        );
        if (!options.silent) notify(error.message);
        reject(error);
      },
      fail: () => {
        // 断网与超时都落在这里：小程序拿不到 HTTP 状态，只能给一个通用码
        const error = new ApiError(ErrorCode.NETWORK, '网络不太顺畅，请检查连接后重试', 0);
        if (!options.silent) notify(error.message);
        reject(error);
      },
    });
  });
}
