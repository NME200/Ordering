<script lang="ts">
import { computed, defineComponent } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import { FALLBACK_THEME, useAppStore } from '@/store/app';
import { onPopupClick, onPopupClose, popupView } from '@/utils/popup-manager';
import { iconSrc } from '@/utils/icons';

/**
 * 活动弹窗容器（图文型 / 公告型）。
 *
 * 只负责画，队列与频次都在 popup-manager 里；容器挂在页面底部，
 * 同一时刻最多一个 —— 叠两个关不完是弹窗最差体验，文档也明确禁了 stack。
 */
export default defineComponent({
  name: 'PopupLayer',
  components: { LineIcon },
  setup() {
    const app = useAppStore();
    const popup = computed(() => popupView.current);
    const theme = computed(() => ({ ...FALLBACK_THEME, ...app.theme }));

    /** 遮罩浓度可配（默认 0.6），图文型要保证下面的页面隐约可见 */
    const maskStyle = computed(() => {
      const alpha = popup.value?.content.maskAlpha ?? 0.6;
      return `background-color: rgba(38, 30, 24, ${alpha})`;
    });

    /**
     * 图文型的盒子尺寸。
     *
     * 用**固定盒子 + aspectFit**而不是 `widthFix`：widthFix 让图片按自身比例撑高，
     * 一张 600×780 的稿子在矮屏上会把关闭按钮顶出屏幕，顾客只剩「关不掉」。
     * 配了 width/height 就照配的比例开洞，没配走 600×780 的默认活动图比例。
     */
    const imageStyle = computed(() => {
      const content = popup.value?.content ?? {};
      const width = content.width ? Math.min(690, content.width) : 600;
      const height = content.height ? Math.min(840, content.height) : 780;
      return [
        `width:${width * 2}rpx`,
        `height:${height * 2}rpx`,
        `max-height:62vh`,
        `border-radius:${theme.value.radius ?? 16}px`,
      ].join(';');
    });

    const closeIcon = computed(() =>
      iconSrc('close', theme.value.subTextColor ?? '#9a908a', 1.5),
    );

    return { popup, theme, maskStyle, imageStyle, closeIcon, popupView, onPopupClick, onPopupClose };
  },
});
</script>

<template>
  <view v-if="popup" class="popup" :style="maskStyle">
    <view class="popup__stage">
      <!-- 图文型：一张活动图 + 跳转，关闭按钮与「1/N」放在图下方 -->
      <template v-if="popup.type === 'image'">
        <view class="popup__image-wrap" @click="onPopupClick">
          <image class="popup__image" :src="popup.content.image" :style="imageStyle" mode="aspectFit" />
        </view>
        <view class="popup__foot">
          <text v-if="popupView.total > 1" class="popup__index">{{ popupView.index }}/{{ popupView.total }}</text>
          <view v-if="popup.content.closeStyle === 'bottom-text'" class="popup__skip" @click="onPopupClose">
            <text>跳过</text>
          </view>
          <view v-else class="popup__close" @click="onPopupClose">
            <image class="popup__close-icon" :src="closeIcon" />
          </view>
        </view>
      </template>

      <!-- 公告型：标题 + 正文 + 主按钮 -->
      <template v-else>
        <view class="popup__notice card">
          <text class="popup__notice-title">{{ popup.content.title }}</text>
          <text class="popup__notice-text">{{ popup.content.text }}</text>
          <view class="btn-main popup__notice-btn" @click="onPopupClick">
            {{ popup.content.btnText || '我知道了' }}
          </view>
        </view>
        <view class="popup__foot">
          <text v-if="popupView.total > 1" class="popup__index">{{ popupView.index }}/{{ popupView.total }}</text>
          <view class="popup__close" @click="onPopupClose">
            <image class="popup__close-icon" :src="closeIcon" />
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<style scoped lang="scss">
.popup {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.popup__image-wrap {
  border-radius: var(--radius, 16px);
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.06);
}

.popup__image {
  display: block;
  width: 100%;
  height: 100%;
}

/* 关闭与「1/N」放在图下方：图再高也关得掉 */
.popup__foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28rpx;
  margin-top: 28rpx;
}

.popup__close {
  width: 64rpx;
  height: 64rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup__close-icon {
  width: 22px;
  height: 22px;
  opacity: 0.9;
}

.popup__skip {
  padding: 10rpx 36rpx;
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.6);
  color: rgba(255, 255, 255, 0.9);
  font-size: 26rpx;
}

.popup__notice {
  width: 600rpx;
  padding: 48rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  background-color: rgba(255, 255, 255, 0.94);
}

.popup__notice-title {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--ink, #{$n-900});
  text-align: center;
}

.popup__notice-text {
  margin-top: 24rpx;
  font-size: 28rpx;
  line-height: 1.7;
  color: var(--ink-2, #{$n-500});
}

.popup__notice-btn {
  margin-top: 44rpx;
}

.popup__index {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.75);
}
</style>
