import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import type { Dish } from '@shared/types/dish';
import type { SpecOption } from '@shared/types/spec-group';
import { MAX_ORDER_LINES, MAX_QUANTITY_PER_LINE } from '@/constants/pos-limits';
import { newClientToken } from '@/utils/pos';

/** 购物车中的一行（同一菜品 + 同一组规格合并为一条） */
export interface CartLine {
  /** 行唯一键：菜品 ID 与规格项 ID 集合，决定能否与已有行合并 */
  key: string;
  dishId: number;
  dishName: string;
  imageUrl: string | null;
  /** 菜品基础单价（分，取自当前菜单；下单时后端会重新按现价快照） */
  unitPrice: number;
  /** 所选规格项 ID（提交给后端） */
  specOptionIds: number[];
  /** 规格增量合计（分/份） */
  specAmount: number;
  /** 规格摘要文字，如「大杯 / 加珍珠」 */
  specSummary: string;
  quantity: number;
}

/** 随单信息（桌号 / 顾客称呼等，均可选） */
export interface DraftMeta {
  tableNo: string;
  customerName: string;
  customerPhone: string;
  remark: string;
}

const EMPTY_META: DraftMeta = { tableNo: '', customerName: '', customerPhone: '', remark: '' };

/** 本地持久化键：刷新 / 误触返回不能丢掉一张打到一半的单 */
const STORAGE_KEY = 'ordering_cashier_draft';

/** 磁盘上的旧草稿可能来自已改版的字段，读取时逐字段收窄，避免脏数据进状态 */
function readStoredDraft(): { lines: CartLine[]; meta: DraftMeta; clientToken: string } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const source = parsed as Record<string, unknown>;
    const lines = Array.isArray(source.lines) ? (source.lines as CartLine[]) : [];
    const meta =
      typeof source.meta === 'object' && source.meta !== null
        ? { ...EMPTY_META, ...(source.meta as DraftMeta) }
        : { ...EMPTY_META };
    const clientToken = typeof source.clientToken === 'string' ? source.clientToken : '';
    return { lines, meta, clientToken: clientToken || newClientToken() };
  } catch {
    return null;
  }
}

/** 行键：规格项顺序无关，排序后拼接，保证「大杯+珍珠」与「珍珠+大杯」合并 */
function lineKey(dishId: number, specOptionIds: number[]): string {
  return `${dishId}:${[...specOptionIds].sort((a, b) => a - b).join(',')}`;
}

/**
 * 收银台草稿单（当前正在录入的这单）。
 *
 * 单独成 store 而不是页面局部状态，原因有两个：
 * 1. 菜品磁贴的已选份数、票券面板、结算入参三处都要读同一份数据；
 * 2. 刷新 / 跳转后必须能恢复，否则一张打到一半的单全丢。
 *
 * `clientToken` 与草稿同生同灭：录入期间不变（重复点击 / 刷新后重试都只落一单），
 * 开单成功后立即换新，避免下一单被当成上一单的重复提交。
 */
export const useDraftStore = defineStore('draft', () => {
  const stored = readStoredDraft();

  const lines = ref<CartLine[]>(stored?.lines ?? []);
  const meta = reactive<DraftMeta>(stored?.meta ?? { ...EMPTY_META });
  const clientToken = ref<string>(stored?.clientToken ?? newClientToken());

  const lineCount = computed(() => lines.value.length);
  const dishCount = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
  const totalAmount = computed(() =>
    lines.value.reduce((sum, line) => sum + (line.unitPrice + line.specAmount) * line.quantity, 0),
  );
  const isEmpty = computed(() => lines.value.length === 0);

  /** 取回某菜品已加入的数量，用于菜品卡片上的角标 */
  function quantityOf(dishId: number): number {
    return lines.value
      .filter((line) => line.dishId === dishId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  /**
   * 加入购物车。
   * @returns false 表示超出后端边界（明细行数 / 单行份数），本地直接拦下不发请求
   */
  function add(dish: Dish, specOptionIds: number[], quantity = 1): boolean {
    const key = lineKey(dish.id, specOptionIds);
    const existing = lines.value.find((line) => line.key === key);
    if (existing) {
      const next = existing.quantity + quantity;
      if (next > MAX_QUANTITY_PER_LINE) {
        return false;
      }
      existing.quantity = next;
      return true;
    }

    if (lines.value.length >= MAX_ORDER_LINES) {
      return false;
    }

    const chosenOptions: SpecOption[] = dish.specGroups
      .flatMap((group) => group.options)
      .filter((option) => specOptionIds.includes(option.id))
      .sort((a, b) => specOptionIds.indexOf(a.id) - specOptionIds.indexOf(b.id));

    lines.value.push({
      key,
      dishId: dish.id,
      dishName: dish.name,
      imageUrl: dish.imageUrl,
      unitPrice: dish.effectivePrice,
      specOptionIds: [...specOptionIds],
      specAmount: chosenOptions.reduce((sum, option) => sum + option.priceDiff, 0),
      specSummary: chosenOptions.map((option) => option.name).join(' / '),
      quantity: Math.min(Math.max(quantity, 1), MAX_QUANTITY_PER_LINE),
    });
    return true;
  }

  /** 改数量；传入 0 时删除该行 */
  function setQuantity(key: string, quantity: number): void {
    const line = lines.value.find((item) => item.key === key);
    if (!line) {
      return;
    }
    if (quantity <= 0) {
      removeLine(key);
      return;
    }
    line.quantity = Math.min(quantity, MAX_QUANTITY_PER_LINE);
  }

  function removeLine(key: string): void {
    lines.value = lines.value.filter((line) => line.key !== key);
  }

  /** 改随单信息（桌号 / 称呼 / 手机号 / 备注）；提交时再统一 trim */
  function setMeta(key: keyof DraftMeta, value: string): void {
    meta[key] = value;
  }

  /** 清空草稿并换一把新的幂等令牌（开单成功 / 手动清单都走这里） */
  function reset(): void {
    lines.value = [];
    Object.assign(meta, EMPTY_META);
    clientToken.value = newClientToken();
  }

  /** 落盘：显式取 .value，避免把 Ref 对象本身序列化进 localStorage */
  function persist(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lines: lines.value, meta: { ...meta }, clientToken: clientToken.value }),
    );
  }

  // meta 是 reactive 对象，作为 watch 源时会被深度监听；漏掉它就存不下桌号与备注
  watch([lines, meta, clientToken], persist, { deep: true });

  return {
    lines,
    meta,
    clientToken,
    lineCount,
    dishCount,
    totalAmount,
    isEmpty,
    quantityOf,
    add,
    setQuantity,
    removeLine,
    setMeta,
    reset,
  };
});
