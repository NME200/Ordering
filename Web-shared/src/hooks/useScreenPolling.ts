import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 大屏轮询。
 *
 * 三件事必须在这里做对，否则挂店的屏会自己出问题：
 * 1. **页面不可见时不轮询**：浏览器后台标签页会被限流到 1 分钟一次，与其让请求堆积，
 *    不如切回来时立刻补一次；
 * 2. **失败不清屏**：网络抖一下就把图擦成空白，看屏的人会以为系统挂了；
 * 3. **同一时刻只允许一个在途请求**：慢接口叠加会让旧响应覆盖新响应。
 */
export function useScreenPolling<T>(loader: () => Promise<T>, intervalMs = 10_000) {
  const data = ref<T | null>(null) as { value: T | null };
  const error = ref('');
  const updatedAt = ref('');
  const firstLoad = ref(true);

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let stopped = false;

  async function refresh(): Promise<void> {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const result = await loader();
      if (!stopped) {
        data.value = result;
        error.value = '';
        updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      }
    } catch (cause) {
      if (!stopped) {
        error.value = cause instanceof Error ? cause.message : '数据没拉到';
      }
    } finally {
      inFlight = false;
      firstLoad.value = false;
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible') {
      void refresh();
    }
  }

  onMounted(() => {
    void refresh();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
    }
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { data, error, updatedAt, firstLoad, refresh };
}
