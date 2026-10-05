import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MenuCategory, MenuDish } from '@/types/api';

const CART_KEY = 'cart-cache-v1';

/** 一行购物袋明细：同一菜品 + 同一规格组合合并成一行 */
export interface CartLine {
  key: string;
  dishId: number;
  dishName: string;
  imageUrl: string | null;
  unit: string;
  /** 本店有效基础价（分） */
  unitPrice: number;
  /** 规格增量合计（分 / 份） */
  specAmount: number;
  specSummary: string;
  specOptionIds: number[];
  quantity: number;
}

export interface MenuDiff {
  /** 已下架或沽清、被移出购物袋的行 */
  removed: string[];
  /** 价格变了的行 */
  repriced: string[];
}

function lineKey(dishId: number, specOptionIds: number[]): string {
  return `${dishId}|${[...specOptionIds].sort((a, b) => a - b).join(',')}`;
}

function readCache(): { storeId: number; lines: CartLine[] } | null {
  try {
    const raw = uni.getStorageSync(CART_KEY);
    return raw ? (JSON.parse(raw) as { storeId: number; lines: CartLine[] }) : null;
  } catch {
    return null;
  }
}

export const useCartStore = defineStore('cart', () => {
  const storeId = ref(0);
  const lines = ref<CartLine[]>([]);

  function persist(): void {
    if (!storeId.value) return;
    uni.setStorageSync(CART_KEY, JSON.stringify({ storeId: storeId.value, lines: lines.value }));
  }

  /**
   * 进店时对齐购物袋归属。
   *
   * 换店必须清空：购物车里的价格是**本店有效价**，带着 A 店的行去 B 店下单
   * 会被服务端按 B 店重新算价，顾客看到的金额和提交结果就对不上了。
   */
  function enter(id: number): void {
    if (storeId.value === id && lines.value.length >= 0) return;
    const cached = readCache();
    storeId.value = id;
    lines.value = cached && cached.storeId === id ? cached.lines : [];
    persist();
  }

  function add(dish: MenuDish, specOptionIds: number[], quantity: number): void {
    const key = lineKey(dish.id, specOptionIds);
    const existing = lines.value.find((line) => line.key === key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.value.push({
        key,
        dishId: dish.id,
        dishName: dish.name,
        imageUrl: dish.imageUrl,
        unit: dish.unit,
        unitPrice: dish.price,
        specAmount: specAmountOf(dish, specOptionIds),
        specSummary: specSummaryOf(dish, specOptionIds),
        specOptionIds: [...specOptionIds],
        quantity,
      });
    }
    persist();
  }

  function setQuantity(key: string, quantity: number): void {
    const line = lines.value.find((item) => item.key === key);
    if (!line) return;
    if (quantity <= 0) {
      remove(key);
      return;
    }
    line.quantity = quantity;
    persist();
  }

  function remove(key: string): void {
    lines.value = lines.value.filter((line) => line.key !== key);
    persist();
  }

  function clear(): void {
    lines.value = [];
    persist();
  }

  /** 菜单重载后对齐：下架/沽清的移除、变价的更新，返回变化项给界面提示 */
  function syncWithMenu(categories: MenuCategory[]): MenuDiff {
    const byId = new Map<number, MenuDish>();
    categories.forEach((category) => category.dishes.forEach((dish) => byId.set(dish.id, dish)));

    const diff: MenuDiff = { removed: [], repriced: [] };
    const kept: CartLine[] = [];
    for (const line of lines.value) {
      const dish = byId.get(line.dishId);
      if (!dish || dish.soldOut) {
        diff.removed.push(line.dishName);
        continue;
      }
      if (dish.price !== line.unitPrice) {
        diff.repriced.push(line.dishName);
        line.unitPrice = dish.price;
      }
      kept.push(line);
    }
    lines.value = kept;
    persist();
    return diff;
  }

  const count = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
  const amount = computed(() =>
    lines.value.reduce((sum, line) => sum + (line.unitPrice + line.specAmount) * line.quantity, 0),
  );

  /** 每道菜的份数，菜单页用它给菜品行标「已选 N 份」 */
  const quantityByDish = computed(() => {
    const map = new Map<number, number>();
    lines.value.forEach((line) => map.set(line.dishId, (map.get(line.dishId) ?? 0) + line.quantity));
    return map;
  });

  return {
    storeId,
    lines,
    count,
    amount,
    quantityByDish,
    enter,
    add,
    setQuantity,
    remove,
    clear,
    syncWithMenu,
  };
});

/** 规格增量合计（分 / 份） */
export function specAmountOf(dish: MenuDish, specOptionIds: number[]): number {
  return dish.specGroups.reduce(
    (sum, group) =>
      sum + group.options.reduce((s, option) => s + (specOptionIds.includes(option.id) ? option.priceDiff : 0), 0),
    0,
  );
}

/** 「大杯 / 少冰」这样的规格摘要，下单响应里后端也给同名字段，展示口径保持一致 */
export function specSummaryOf(dish: MenuDish, specOptionIds: number[]): string {
  const names: string[] = [];
  dish.specGroups.forEach((group) =>
    group.options.forEach((option) => {
      if (specOptionIds.includes(option.id)) names.push(option.name);
    }),
  );
  return names.join(' / ');
}
