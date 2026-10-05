import { defineStore } from 'pinia';
import { ref } from 'vue';

const KEY = 'orders-cache-v1';
const MAX_KEPT = 10;

/**
 * 本机订单凭据。
 *
 * C 端没有账号体系，`payToken` 是查单 / 支付 / 取消的唯一凭据，
 * 后端只在下单响应里给一次 —— 丢了就再也查不到这单，所以必须本机留一份。
 * 换设备或清缓存会丢，这是当前架构的既成事实，界面上不假装能「同步回来」。
 */
export interface OrderRef {
  orderId: number;
  orderNo: string;
  payToken: string;
  storeId: number;
  payableAmount: number;
  createdAt: string;
}

function read(): OrderRef[] {
  try {
    const raw = uni.getStorageSync(KEY);
    return raw ? (JSON.parse(raw) as OrderRef[]) : [];
  } catch {
    return [];
  }
}

export const useOrderStore = defineStore('order', () => {
  const refs = ref<OrderRef[]>(read());

  function persist(): void {
    uni.setStorageSync(KEY, JSON.stringify(refs.value));
  }

  function remember(item: OrderRef): void {
    refs.value = [item, ...refs.value.filter((row) => row.orderNo !== item.orderNo)].slice(0, MAX_KEPT);
    current.value = item;
  }

  /** 最新一单：收银台与订单详情在没有 query 参数时的兜底来源 */
  const current = ref<OrderRef | null>(refs.value[0] ?? null);

  function find(orderNo: string): OrderRef | null {
    return refs.value.find((row) => row.orderNo === orderNo) ?? null;
  }

  return { refs, current, remember, find };
});
