<script setup lang="ts">
import { computed } from 'vue';
import { iconSrc } from '@/utils/line-icons';

/**
 * 后台的线稿图标 —— 与小程序用的是同一份 path 数据。
 *
 * 预览里出现的就是顾客手机上那个图标，不再拿文字凑，
 * 也就不会出现「后台看着对、真机是另一个样」。
 */
const props = defineProps<{
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}>();

const src = computed(() =>
  iconSrc(props.name, props.color ?? '#c8752b', props.strokeWidth ?? 1.5),
);
</script>

<template>
  <img class="li" :src="src" :style="{ width: `${size ?? 22}px`, height: `${size ?? 22}px` }" alt="" />
</template>

<style scoped>
.li {
  display: block;
  flex: none;
}
</style>
