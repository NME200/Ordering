/**
 * 统一请求封装（见 CODEBUDDY.md 6.5）。
 *
 * 业务代码一律通过 `request<T>()` 发起请求，禁止直接使用 axios。
 * 职责：
 * 1. 注入 Authorization 头；
 * 2. 解包后端统一响应 `{ code, message, data }`，只把 data 交给调用方；
 * 3. 统一错误提示，401 交由外部注册的处理器（跳登录）处理。
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiResponse } from '../types/api';
import { clearToken, getToken } from './auth';

/** 业务异常：携带后端错误码，便于调用方按码分支处理 */
export class BusinessError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
  }
}

/** 扩展的请求配置 */
export interface RequestConfig extends AxiosRequestConfig {
  /** 静默模式：失败时不弹出全局错误提示，由调用方自行处理 */
  silent?: boolean;
}

/** 401 处理器，由应用启动时注册，避免请求层直接依赖 router / store */
type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** 注册未登录 / 登录失效时的处理器 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
});

/** 请求拦截器：注入令牌 */
service.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * 响应拦截器：只处理 HTTP 层错误。
 * 业务层的 `code !== 0` 由 `request()` 统一处理，避免提示重复。
 */
service.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<ApiResponse<null>>) => {
    const config = error.config as RequestConfig | undefined;
    const silent = config?.silent === true;

    const status = error.response?.status;
    const body = error.response?.data;
    const message = body?.message || resolveNetworkMessage(error);

    if (status === 401) {
      // 登录失效：清掉本地令牌并通知外部跳转登录
      clearToken();
      unauthorizedHandler?.();
    }

    if (!silent) {
      ElMessage.error(message);
    }

    return Promise.reject(new BusinessError(body?.code ?? -1, message));
  },
);

/** 网络层异常的兜底文案 */
function resolveNetworkMessage(error: AxiosError): string {
  if (error.code === 'ECONNABORTED') {
    return '请求超时，请稍后重试';
  }
  if (!error.response) {
    return '网络连接失败，请检查后端服务是否已启动';
  }
  return '请求失败，请稍后重试';
}

/**
 * 发起请求并解包响应。
 *
 * @example
 * const page = await request<PaginatedData<Merchant>>({ url: '/merchants', params });
 */
export async function request<T>(config: RequestConfig): Promise<T> {
  const { silent = false, ...axiosConfig } = config;
  const response = await service.request<ApiResponse<T>>(axiosConfig);
  const body = response.data;

  // 非标准响应（理论上不会出现）直接透传，避免误伤
  if (!body || typeof body !== 'object' || !('code' in body)) {
    return body as unknown as T;
  }

  if (body.code !== 0) {
    if (!silent) {
      ElMessage.error(body.message || '请求失败');
    }
    throw new BusinessError(body.code, body.message);
  }

  return body.data;
}

export default service;
