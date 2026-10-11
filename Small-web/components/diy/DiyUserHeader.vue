<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';

/**
 * 个人中心头部。
 *
 * 昵称 / ID / 手机号都来自顾客账号，账号还没落地时页面传空进来 ——
 * 组件照画结构、值位留空，**不在这里编一个「微信用户」或假 ID**。
 */
export default defineComponent({
  name: 'DiyUserHeader',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    nickname: { type: String, default: '' },
    customerId: { type: String, default: '' },
    phone: { type: String, default: '' },
    /** 顾客自己上传的头像；没有就画线稿占位，不放默认人头图 */
    avatar: { type: String, default: '' },
  },
  emits: { bind: () => true, setting: () => true },
  setup(props) {
    const background = computed(() => {
      if (props.config.bgType === 'image' && props.config.bgImage) {
        return `background-image:url(${props.config.bgImage});background-size:cover`;
      }
      const colors = props.config.bgColors?.length === 2 ? props.config.bgColors : ['#c8752b', '#e8a860'];
      return `background:linear-gradient(135deg,${colors[0]},${colors[1]})`;
    });
    const tip = computed(() => props.config.bindPhoneTip || '');
    return { background, tip };
  },
});
</script>

<template>
  <view class="head" :style="background">
    <view class="head__gear" @click="$emit('setting')">
      <LineIcon name="setting" :size="20" color="#ffffff" />
    </view>
    <view class="head__body">
      <view class="head__avatar">
        <image v-if="avatar" class="head__avatar-img" :src="avatar" mode="aspectFill" />
        <LineIcon v-else name="user" :size="26" color="#ffffff" />
      </view>
      <view class="head__info">
        <text class="head__name">{{ nickname || '未登录' }}</text>
        <text v-if="config.showId !== false && customerId" class="head__id num">ID {{ customerId }}</text>
        <text v-if="!phone && tip" class="head__tip" @click="$emit('bind')">{{ tip }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.head {
  position: relative;
  padding: 48rpx 32rpx 56rpx;
  color: #fff;
}

.head__gear {
  position: absolute;
  top: 28rpx;
  right: 28rpx;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.head__body {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.head__avatar {
  width: 116rpx;
  height: 116rpx;
  border-radius: 50%;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
}

.head__avatar-img {
  width: 100%;
  height: 100%;
}

.head__info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.head__name {
  font-size: 36rpx;
  font-weight: 700;
}

.head__id,
.head__tip {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.82);
}

.head__tip {
  padding: 6rpx 18rpx;
  align-self: flex-start;
  border-radius: 999rpx;
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
