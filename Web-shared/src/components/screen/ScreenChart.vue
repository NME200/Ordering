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
 * 只注册用到的三个图与三个组件：整包 `import * as echarts from 'echarts'` 会把地图、
 * 关系图、GL 全拖进首屏，而大屏往往就开在一台普通的门店小主机上。
 *
 * `setOption` 一律 notMerge：占比与排行的条目数会随当天数据变（今天三种就餐方式、
 * 明天可能两种），合并更新会把上一次多出来的那条留在图上，看起来像"数据没刷"。
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
