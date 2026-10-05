/**
 * 通用接口类型。
 *
 * 与后端 `common/interfaces/api-response.interface.ts`、
 * `common/dto/paginated.dto.ts` 严格对齐（见 CODEBUDDY.md 9）。
 */

/** 后端统一响应体 */
export interface ApiResponse<T> {
  /** 0 表示成功，其余为业务错误码 */
  code: number;
  message: string;
  data: T;
}

/** 分页响应数据 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页请求公共参数（列表查询一律显式带上，便于统一处理） */
export interface PaginationQuery {
  page: number;
  pageSize: number;
}

/** 每页最大条数，与后端 MAX_PAGE_SIZE 保持一致 */
export const MAX_PAGE_SIZE = 100;

/** 列表查询的通用状态筛选：0 禁用 / 1 启用 */
export type StatusFilter = 0 | 1 | undefined;

/** 下拉选项 */
export interface SelectOption<T = number | string> {
  label: string;
  value: T;
}
