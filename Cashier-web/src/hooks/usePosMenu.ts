import { computed, ref } from 'vue';
import { fetchDishCategoryOptions } from '@shared/api/dish-category';
import { fetchDishes } from '@shared/api/dish';
import { useUserStore } from '@/store/modules/user';
import type { Dish } from '@shared/types/dish';
import type { DishCategory } from '@shared/types/dish-category';
import type { SpecGroup } from '@shared/types/spec-group';
import { CommonStatus, DishStatus } from '@shared/types/enums';

/** 后端 MAX_PAGE_SIZE = 100，一次性多拉几页的兜底页数上限 */
const MAX_PAGES = 5;

/**
 * 菜品当前生效的规格组。
 *
 * 与后端 `buildItemDrafts` 同口径：**停用的规格组视为不生效**，
 * 组内规格项全停也算不生效。收银台据此决定「直接加购」还是「先弹规格」，
 * 口径不一致会出现前端逼顾客选一个后端根本不接受的规格。
 */
export function activeSpecGroups(dish: Dish): SpecGroup[] {
  return dish.specGroups
    .filter((group) => group.status === CommonStatus.ENABLED)
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => option.status === CommonStatus.ENABLED),
    }))
    .filter((group) => group.options.length > 0)
    .sort((a, b) => a.sort - b.sort);
}

/**
 * 收银台菜单（分类 + 本店可点菜品）。
 *
 * 与商户后台的「菜品管理」不同，收银台要的是**一整张可点单的菜单**：
 * - 按**本店有效菜单**取：带本人门店 `storeId`，服务端会把商户标准菜单与本店例外
 *   合并后返回（`onSale` / `soldOut` / `effectivePrice`）；
 * - 本店停售与商户下架的菜**不进菜单**，沽清的菜保留但置灰 —— 收银员要能区分
 *   「这家店没这道菜」和「今天卖完了」；
 * - 一次性拉到后端分页上限，之后按分类与关键词**在本地过滤**，
 *   保证点单时不再等待网络（触屏上每次点击都要掉一次网络是灾难）。
 *
 * 菜品超过 `MAX_PAGES × 100` 家时只加载前若干页，属于刻意取舍：
 * 真到那个规模该按分类分屏加载，而不是把几千个菜品塞进一次点击。
 */
export function usePosMenu() {
  const categories = ref<DishCategory[]>([]);
  const dishes = ref<Dish[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const activeCategoryId = ref<number | null>(null);
  const keyword = ref('');

  const visibleDishes = computed(() => {
    const text = keyword.value.trim().toLowerCase();
    return dishes.value.filter((dish) => {
      if (activeCategoryId.value !== null && dish.categoryId !== activeCategoryId.value) {
        return false;
      }
      if (!text) {
        return true;
      }
      return (
        dish.name.toLowerCase().includes(text) ||
        (dish.description ?? '').toLowerCase().includes(text)
      );
    });
  });

  /** 各分类的在售菜品数，用于分类按钮上的角标 */
  const countByCategory = computed(() => {
    const map: Record<number, number> = {};
    dishes.value.forEach((dish) => {
      map[dish.categoryId] = (map[dish.categoryId] ?? 0) + 1;
    });
    return map;
  });

  async function load(): Promise<void> {
    loading.value = true;
    // 收银员与门店管理员都绑定门店，菜单范围由服务端按 Token 收成他家那一份
    const storeId = useUserStore().storeId ?? undefined;
    try {
      const [categoryList, first] = await Promise.all([
        fetchDishCategoryOptions(undefined, storeId),
        fetchDishes({ page: 1, pageSize: 100, status: DishStatus.ON_SHELF, storeId }),
      ]);

      let list = first.list;
      const pages = Math.min(Math.ceil(first.total / 100), MAX_PAGES);
      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, index) =>
            fetchDishes({ page: index + 2, pageSize: 100, status: DishStatus.ON_SHELF, storeId }),
          ),
        );
        list = [...list, ...rest.flatMap((page) => page.list)];
      }

      categories.value = [...categoryList].sort((a, b) => a.sort - b.sort);
      // 本店停售的菜不进菜单；沽清的留在菜单上置灰 —— 收银员要能区分「没这道菜」和「今天卖完了」
      dishes.value = list
        .filter((dish) => dish.onSale || dish.soldOut)
        .sort((a, b) => a.sort - b.sort);
      loaded.value = true;

      // 分类被删除或首次加载时，把选中的分类校正回「全部」
      if (
        activeCategoryId.value !== null &&
        !categories.value.some((item) => item.id === activeCategoryId.value)
      ) {
        activeCategoryId.value = null;
      }
    } finally {
      loading.value = false;
    }
  }

  function selectCategory(id: number | null): void {
    activeCategoryId.value = id;
  }

  return {
    categories,
    dishes,
    visibleDishes,
    countByCategory,
    loading,
    loaded,
    activeCategoryId,
    keyword,
    load,
    selectCategory,
  };
}
