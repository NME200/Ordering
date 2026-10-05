import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchStore } from '@shared/api/store';
import type { Store } from '@shared/types/store';
import { BusinessStatus, CommonStatus } from '@shared/types/enums';
import { useUserStore } from './user';

/**
 * 当前收银台所在的门店上下文。
 *
 * 收银员与门店管理员都是门店绑定角色，`profile.storeId` 唯一确定了「我是哪台收银机」，
 * 顶部常驻显示门店名与营业状态：
 * - **打烊**时收银台仍可开单（线下由收银员自行判断，与 C 端扫码下单被拒不同，见后端 createPos）；
 * - **停用**（被平台或商户禁用）时开单会被服务端拒（`80006 门店已停用，无法开单`），
 *   所以顶部必须显示「已停用」，不能让收银员点了开单才知道。
 */
export const useTerminalStore = defineStore('terminal', () => {
  const store = ref<Store | null>(null);
  const loading = ref(false);

  const storeName = computed(() => store.value?.name ?? '');
  const isStopped = computed(() => store.value?.status === CommonStatus.DISABLED);
  /** 顶部标签取「非营业」的样式：停用与打烊都算 */
  const isClosed = computed(
    () => isStopped.value || store.value?.businessStatus === BusinessStatus.CLOSED,
  );

  /** 拉取门店信息；失败不阻断收银，顶部退化为只显示账号信息 */
  async function load(): Promise<void> {
    const userStore = useUserStore();
    const storeId = userStore.storeId;
    if (!storeId) {
      store.value = null;
      return;
    }
    if (store.value?.id === storeId) {
      return;
    }

    loading.value = true;
    try {
      store.value = await fetchStore(storeId);
    } catch {
      store.value = null;
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    store.value = null;
  }

  return { store, storeName, isStopped, isClosed, loading, load, clear };
});
