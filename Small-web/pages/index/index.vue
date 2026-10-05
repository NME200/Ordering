<script lang="ts">
import { defineComponent, ref } from 'vue';
import { fetchStore } from '@/api/public';
import { IS_DEV } from '@/config/env';
import { useAppStore } from '@/store/app';
import { ErrorCode } from '@/types/error-codes';

/**
 * 从二维码参数里取门店 ID。
 *
 * 三种来源都要认：普通二维码扫出来是完整链接（`q`）、
 * 小程序码是 `scene`（最长 32 字符，通常直接放 storeId=1 这种短参），
 * 开发者工具编译模式则是普通 query。
 */
function parseStoreId(text: string | undefined): number {
  if (!text) return 0;
  const decoded = decodeURIComponent(text);
  const matched = decoded.match(/storeId[=:/](\d{1,9})/i);
  if (matched) return Number(matched[1]);
  return /^\d{1,9}$/.test(decoded.trim()) ? Number(decoded.trim()) : 0;
}

export default defineComponent({
  setup() {
    const app = useAppStore();
    const hint = ref('');
    const busy = ref(false);
    const devStoreId = ref('1');

    async function enter(storeId: number): Promise<void> {
      if (!storeId) {
        hint.value = '没有识别到门店，请重新扫桌上的点餐码';
        return;
      }
      busy.value = true;
      hint.value = '';
      try {
        const store = await fetchStore(storeId);
        app.store = store;
        uni.redirectTo({ url: `/pages/home/home?storeId=${store.id}` });
      } catch (error) {
        const code = (error as { code?: number }).code;
        hint.value =
          code === ErrorCode.STORE_NOT_FOUND
            ? '这家店可能已下线、暂停服务或二维码过期，请向店员索取当前有效的点餐码'
            : (error as Error).message;
      } finally {
        busy.value = false;
      }
    }

    function scan(): void {
      uni.scanCode({
        success: (res) => {
          void enter(parseStoreId(res.path) || parseStoreId(res.result));
        },
        fail: () => {
          hint.value = '没能读到二维码。可以重扫一次，或让店员在收银台帮你开单';
        },
      });
    }

    return { app, hint, busy, devStoreId, isDev: IS_DEV, enter, scan };
  },

  onLoad(query) {
    const id = parseStoreId(query?.storeId) || parseStoreId(query?.scene) || parseStoreId(query?.q);
    if (id) void this.enter(id);
  },
});
</script>

<template>
  <view class="entry" :style="app.cssVars">
    <view class="entry__hero">
      <text class="entry__title">扫码点餐</text>
      <text class="entry__sub">扫桌上的点餐码即可下单，无需注册、无需下载</text>
    </view>

    <view class="entry__body">
      <view class="btn-primary" :class="{ 'is-busy': busy }" @click="scan">
        {{ busy ? '正在进店…' : '扫一扫点餐' }}
      </view>
      <text v-if="hint" class="entry__hint">{{ hint }}</text>
    </view>

    <view class="entry__foot">
      <text class="entry__foot-line">找不到入口？让店员在收银台为你开单，同样能出小票。</text>
    </view>

    <!-- 开发版才出现：微信开发者工具里不方便扫码时直接进示例门店 -->
    <view v-if="isDev" class="entry__dev">
      <text class="entry__dev-title">调试入口（仅开发版）</text>
      <view class="entry__dev-row">
        <input v-model="devStoreId" class="entry__dev-input num" type="number" placeholder="门店 ID" />
        <view class="entry__dev-btn" @click="enter(Number(devStoreId))">进入</view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.entry {
  min-height: 100vh;
  padding: 0 48rpx;
  background-color: var(--page-bg, #fff);
  color: var(--ink, #241f1c);
  display: flex;
  flex-direction: column;
}

.entry__hero {
  padding: 140rpx 0 60rpx;
  border-bottom: 1rpx solid $hair;
}

.entry__title {
  display: block;
  font-size: 60rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

.entry__sub {
  display: block;
  margin-top: 16rpx;
  font-size: 26rpx;
  color: var(--ink-2, #857a73);
}

.entry__body {
  padding-top: 80rpx;
}

.btn-primary {
  height: 96rpx;
  line-height: 96rpx;
  text-align: center;
  border-radius: 999rpx;
  background-color: var(--brand, #{$brand-500});
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;

  &.is-busy {
    opacity: 0.6;
  }
}

.entry__hint {
  display: block;
  margin-top: 24rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: $err;
}

.entry__foot {
  margin-top: auto;
  padding: 40rpx 0 60rpx;
}

.entry__foot-line {
  font-size: 24rpx;
  color: var(--ink-2, #857a73);
}

.entry__dev {
  padding: 32rpx 0 60rpx;
  border-top: 1rpx solid $hair;
}

.entry__dev-title {
  font-size: 24rpx;
  color: $n-400;
}

.entry__dev-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 20rpx;
}

.entry__dev-input {
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  border: 1rpx solid $n-200;
  font-size: 28rpx;
}

.entry__dev-btn {
  padding: 0 36rpx;
  height: 72rpx;
  line-height: 72rpx;
  border: 1rpx solid $brand-500;
  border-radius: 999rpx;
  color: var(--brand, #{$brand-500});
  font-size: 28rpx;
}
</style>
