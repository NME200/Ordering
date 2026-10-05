/**
 * 统一响应结构（见 CODEBUDDY.md 9）。
 *
 * 成功：{ code: 0, message: 'success', data: ... }
 * 失败：{ code: <业务错误码>, message: <可读提示>, data: null }
 *
 * 注意：失败时 HTTP 状态码同样会反映错误（401/403/404/400/500 等），
 * 前端拦截器可同时依据 HTTP 状态码与 code 做处理。
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 统一分页响应结构 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
