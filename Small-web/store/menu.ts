import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchMenu } from '@/api/public';
import { ErrorCode } from '@/types/error-codes';
import { useAppStore } from '@/store/app';
import { useCartStore } from '@/store/cart';
import { setLastMerchantId } from '@/utils/auth';
import type { MenuCategory, MenuDish, PublicStore } from '@/types/api';

/**
 * 本店菜单的共享状态。
 *
 * 首页要画分类宫格与推荐位、菜单页要画全量列表，两处都要同一份数据 ——
 * 菜单接口 60 次/分，进店路径上拉两次是浪费，也容易在两页之间出现不一致的价。
 */
export const useMenuStore = defineStore('menu', () => {
  const storeId = ref(0);
  const store = ref<PublicStore | null>(null);
  const categories = ref<MenuCategory[]>([]);
  const loading = ref(false);
  const error = ref('');
  /** 业务码单独留一份：首页要区分「二维码失效」与「网络不通」两种失败 */
  const errorCode = ref(0);
  /**
   * 首页点分类宫格 / 推荐位后要定位到菜单页的哪一组。
   *
   * 原生 switchTab 不能带 query，所以这个「待定位」目标只能放在 store 里，
   * 由菜单页 onShow 取用后清空。
   */
  const focus = ref<{ categoryId?: number; dishId?: number } | null>(null);

  function requestFocus(target: { categoryId?: number; dishId?: number }): void {
    focus.value = target;
  }

  function takeFocus(): { categoryId?: number; dishId?: number } | null {
    const pending = focus.value;
    focus.value = null;
    return pending;
  }

  /** 命中限流时的退避秒数：倒计时结束前不再发请求 */
  const retryIn = ref(0);

  const dishes = computed<MenuDish[]>(() => categories.value.flatMap((item) => item.dishes));
  const dishTotal = computed(() => dishes.value.length);
  const soldOutTotal = computed(() => dishes.value.filter((dish) => dish.soldOut).length);

  function findDish(dishId: number): MenuDish | null {
    return dishes.value.find((dish) => dish.id === dishId) ?? null;
  }

  /** 推荐位手选模式的取菜：按平台给的 ID 顺序，取不到的跳过 */
  function pickByIds(ids: number[] | undefined): MenuDish[] {
    if (!ids?.length) return [];
    return ids.map((id) => findDish(id)).filter((dish): dish is MenuDish => !!dish);
  }

  function recommended(): MenuDish[] {
    return dishes.value.filter((dish) => dish.isRecommend);
  }

  async function load(force = false): Promise<boolean> {
    if (!storeId.value) return false;
    if (loading.value) return false;
    if (!force && categories.value.length && store.value) return true;
    loading.value = true;
    error.value = '';
    try {
      const menu = await fetchMenu(storeId.value);
      store.value = menu.store;
      categories.value = menu.categories;
      errorCode.value = 0;
      // 店名与营业状态在确认页、收银台都要用，统一挂在 app store 上
      useAppStore().store = menu.store;
      // 记住这次进的商户：「我的」页的资产是按商户的，冷启动直接切到那一页时靠它取值
      setLastMerchantId(menu.store.merchantId);
      return true;
    } catch (cause) {
      const code = (cause as { code?: number }).code ?? 0;
      errorCode.value = code;
      if (code === ErrorCode.TOO_MANY_REQUESTS) retryIn.value = 30;
      error.value = (cause as Error).message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** 进店的唯一入口：先对齐购物袋归属，再拉菜单 */
  async function enter(id: number, force = false): Promise<boolean> {
    if (storeId.value !== id) {
      storeId.value = id;
      store.value = null;
      categories.value = [];
      useCartStore().enter(id);
    }
    return load(force);
  }

  return {
    storeId,
    store,
    categories,
    dishes,
    dishTotal,
    soldOutTotal,
    loading,
    error,
    errorCode,
    retryIn,
    load,
    enter,
    requestFocus,
    takeFocus,
    findDish,
    pickByIds,
    recommended,
  };
});
