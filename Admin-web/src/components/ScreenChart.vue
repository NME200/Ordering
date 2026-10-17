<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

/**
 * ECharts 的薄壳。
 *
 * 为什么这个文件在 app 里而不在 Web-shared：共享包会被三端的 tsconfig 一起
 * `include` 做类型检查，而 echarts 只有需要大屏的两端装了。放在共享包里，
 * 收银端会因为解析不到 `echarts/core` 直接类型检查失败 —— 一个不画图的端
 * 被迫装 300KB 的图表库。所以共享的是外壳与面板，图表壳各留一份。
 *
 * 只注册用到的三个图与三个组件：整包引入会把地图、关系图、GL 全拖进首屏。
 *
 * `setOption` 一律 notMerge：占比与排行的条目数会随当天数据变，
 * 合并更新会把上一次多出来的那条留在图上，看起来像"数据没刷"。
 */
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{
  option: EChartsOption;
}>();

const host = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!host.value) {
    return;
  }
  chart = echarts.init(host.value, undefined, { renderer: 'canvas' });
  chart.setOption(props.option, true);
  // 外层是 1920×1080 整体 scale，容器像素尺寸不变，但仍要防住窗口变化与首次布局
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(host.value);
});

watch(
  () => props.option,
  (next) => chart?.setOption(next, true),
  { deep: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="host" class="chart" />
</template>

<style scoped lang="scss">
.chart {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
