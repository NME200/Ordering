import { reactive, ref, type Ref } from 'vue';
import type { PaginatedData, PaginationQuery } from '../types/api';

/**
 * 剔除空查询条件。
 * 空串 / null / undefined 一律不发给后端，避免后端把空串当成有效筛选值。
 * 注意：0 与 false 是有效取值，必须保留。
 */
export function sanitizeQuery<Q extends object>(source: Q): Q {
  const result = { ...source } as Record<string, unknown>;
  Object.keys(result).forEach((key) => {
    const value = result[key];
    if (value === '' || value === null || value === undefined) {
      delete result[key];
    }
  });
  return result as Q;
}

/** 列表页通用状态：查询条件 + 数据 + 分页 + 加载态 */
export interface ListQueryState<T, Q extends PaginationQuery> {
  list: Ref<T[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  query: Q;
  /** 按当前条件加载（保持当前页码） */
  load: () => Promise<void>;
  /** 条件变更后从第 1 页重新查询 */
  search: () => void;
  /** 重置为默认条件并查询 */
  reset: () => void;
}

/**
 * 列表页通用逻辑（见 CODEBUDDY.md 6.2「逻辑复用抽为 hooks」）。
 *
 * 六个业务模块的列表页结构完全一致，抽到这里后各页面只需声明
 * 「查询条件」与「取数函数」，其余（分页、加载、重置）复用。
 */
export function useListQuery<T, Q extends PaginationQuery>(
  fetcher: (query: Q) => Promise<PaginatedData<T>>,
  defaultQuery: Q,
): ListQueryState<T, Q> {
  const list = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const query = reactive({ ...defaultQuery }) as Q;

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const result = await fetcher(sanitizeQuery(query));
      list.value = result.list;
      total.value = result.total;
    } finally {
      loading.value = false;
    }
  }

  function search(): void {
    query.page = 1;
    void load();
  }

  function reset(): void {
    Object.assign(query, { ...defaultQuery, page: 1 });
    void load();
  }

  return { list, total, loading, query, load, search, reset };
}
