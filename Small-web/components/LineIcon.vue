<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import { iconSrc } from '@/utils/icons';
import { FALLBACK_THEME, useAppStore } from '@/store/app';

type Tone = 'ink' | 'brand' | 'sub' | 'white';

/**
 * 全站唯一的图标出口（1.5px 细线线稿）。
 *
 * `tone` 决定取哪个主题色，色值来自平台下发的装修配置 ——
 * 所以平台改成绿色时，图标跟着变绿，不会出现「卡片新、图标旧」。
 */
export default defineComponent({
  name: 'LineIcon',
  props: {
    name: { type: String, required: true },
    /** 边长（px） */
    size: { type: Number, default: 22 },
    tone: { type: String as PropType<Tone>, default: 'ink' },
    /** 显式色值，优先于 tone（弹层压在深色图上时用） */
    color: { type: String, default: '' },
    strokeWidth: { type: Number, default: 1.5 },
  },
  setup(props) {
    const app = useAppStore();

    const src = computed(() => {
      const theme = { ...FALLBACK_THEME, ...app.theme };
      const toneColor: Record<Tone, string> = {
        ink: theme.textColor ?? FALLBACK_THEME.textColor ?? '#3a322c',
        brand: theme.primaryColor ?? FALLBACK_THEME.primaryColor ?? '#c8752b',
        sub: theme.subTextColor ?? FALLBACK_THEME.subTextColor ?? '#9a908a',
        white: '#ffffff',
      };
      return iconSrc(props.name, props.color || toneColor[props.tone], props.strokeWidth);
    });

    return { src };
  },
});
</script>

<template>
  <image class="line-icon" :src="src" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>

<style scoped>
.line-icon {
  flex: none;
  display: block;
}
</style>
