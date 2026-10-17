<script setup lang="ts">
import { computed } from 'vue';
import ScreenChart from '@/components/ScreenChart.vue';
import ScreenPanel from '@shared/components/screen/ScreenPanel.vue';
import ScreenShell from '@shared/components/screen/ScreenShell.vue';
import { fetchMerchantScreen } from '@shared/api/statistics';
import { useScreenPolling } from '@shared/hooks/useScreenPolling';
import { fenToYuan } from '@shared/utils/format';
import type { EChartsOption } from 'echarts';

/**
 * 商户端数据大屏。
 *
 * 门店绑定角色登录时后端会把范围收成他自己那一家店（见 StatisticsService），
 * 所以这块屏不需要「选门店」的控件 —— 挂在哪间店的墙上，就只显示那间店的数。
 */
const { data, error, updatedAt, firstLoad } = useScreenPolling(fetchMerchantScreen);

/** 大屏专用色板：深色底上要的是对比度，不是后台那套降饱和的办公色 */
const INK = '#e8eefb';
const INK_DIM = '#8fa0c0';
const LINE = 'rgba(140, 165, 205, 0.16)';
const BRAND = '#f0a94b';
const COOL = '#4fb0e5';
const PIE_COLORS = [BRAND, COOL, '#3ecf8e', '#b98cf0', '#f2748a'];

const overview = computed(() => data.value?.overview);
const kpis = computed(() => {
  const value = overview.value;
  if (!value) {
    return [];
  }
  return [
    { label: '今日实收', value: `¥${fenToYuan(value.revenueCent)}`, tone: 'money', hint: `退款 ¥${fenToYuan(value.refundCent)}` },
    { label: '成交单数', value: String(value.paidOrderCount), hint: `下单 ${value.orderCount} · 取消 ${value.cancelledCount}` },
    { label: '客单价', value: `¥${fenToYuan(value.avgOrderCent)}`, hint: '实收 / 成交单数' },
    { label: '待接单', value: String(value.pendingCount), tone: 'warn', hint: '已付款等商家点接单' },
    { label: '制作中', value: String(value.preparingCount), hint: '后厨正在做' },
    { label: '待取餐', value: String(value.readyCount), tone: 'ok', hint: '已出餐等顾客拿' },
    { label: '今日新客', value: String(value.newCustomerCount), hint: '商户口径（首单在今日）' },
    { label: '有成交门店', value: String(value.activeStoreCount), hint: '今日收到过钱的店' },
  ];
});

const axisBase = {
  axisLine: { lineStyle: { color: LINE } },
  axisTick: { show: false },
  axisLabel: { color: INK_DIM, fontSize: 12 },
};

/**
 * 金额轴一律**按分参与计算、按元显示**。
 *
 * 中途把分除成元再四舍五入，屏上的排行就会和顶部那张 KPI 卡对不上（差几分钱），
 * 而这类「差几分」一旦被客户发现，整块屏的可信度就没了。
 */
const yuanAxisLabel = { color: INK_DIM, formatter: (value: number) => `¥${fenToYuan(Number(value))}` };
const yuanValueFormatter = (value: unknown) => `¥${fenToYuan(Number(value))}`;

const trendOption = computed<EChartsOption>(() => {
  const rows = data.value?.trend ?? [];
  return {
    grid: { left: 58, right: 52, top: 34, bottom: 28 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['实收', '单量'], textStyle: { color: INK_DIM, fontSize: 12 }, top: 0, right: 0 },
    xAxis: { type: 'category', data: rows.map((row) => row.date.slice(5)), ...axisBase },
    yAxis: [
      { type: 'value', name: '实收', splitLine: { lineStyle: { color: LINE } }, axisLabel: yuanAxisLabel, nameTextStyle: { color: INK_DIM } },
      { type: 'value', name: '单', splitLine: { show: false }, axisLabel: { color: INK_DIM }, nameTextStyle: { color: INK_DIM } },
    ],
    series: [
      {
        name: '实收',
        type: 'bar',
        barWidth: 14,
        itemStyle: { color: BRAND, borderRadius: [3, 3, 0, 0] },
        tooltip: { valueFormatter: yuanValueFormatter },
        data: rows.map((row) => row.revenueCent),
      },
      {
        name: '单量',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: COOL, width: 2 },
        itemStyle: { color: COOL },
        data: rows.map((row) => row.orderCount),
      },
    ],
  };
});

const hourlyOption = computed<EChartsOption>(() => {
  const rows = data.value?.hourly ?? [];
  return {
    grid: { left: 46, right: 56, top: 30, bottom: 28 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['单量', '实收'], textStyle: { color: INK_DIM, fontSize: 12 }, top: 0, right: 0 },
    xAxis: {
      type: 'category',
      data: rows.map((row) => String(row.hour).padStart(2, '0')),
      ...axisBase,
    },
    // 单量与实收是两个单位，各占一根轴：堆进同一根柱子会让「下午那根高」说不清是卖得多还是卖得贵
    yAxis: [
      { type: 'value', name: '单', splitLine: { lineStyle: { color: LINE } }, axisLabel: { color: INK_DIM }, nameTextStyle: { color: INK_DIM } },
      { type: 'value', name: '实收', splitLine: { show: false }, axisLabel: yuanAxisLabel, nameTextStyle: { color: INK_DIM } },
    ],
    series: [
      {
        name: '单量',
        type: 'bar',
        barWidth: '52%',
        itemStyle: { color: COOL, borderRadius: [2, 2, 0, 0] },
        data: rows.map((row) => row.orderCount),
      },
      {
        name: '实收',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: BRAND, width: 2 },
        itemStyle: { color: BRAND },
        tooltip: { valueFormatter: yuanValueFormatter },
        data: rows.map((row) => row.revenueCent),
      },
    ],
  };
});

const diningOption = computed<EChartsOption>(() => {
  const rows = data.value?.diningMix ?? [];
  return {
    color: PIE_COLORS,
    tooltip: { trigger: 'item', formatter: '{b}：{c} 单（{d}%）' },
    legend: { bottom: 0, textStyle: { color: INK_DIM, fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#0a1120', borderWidth: 2 },
        label: { color: INK, fontSize: 13, formatter: '{b}\n{d}%' },
        labelLine: { length: 8, length2: 10 },
        data: rows.map((row) => ({ name: row.label, value: row.count })),
      },
    ],
  };
});

function rankOption(rows: Array<{ name: string; valueCent: number; count: number }>, unit: '元' | '份'): EChartsOption {
  const list = [...rows].reverse();
  return {
    grid: { left: unit === '元' ? 76 : 86, right: 76, top: 12, bottom: 18 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: LINE } },
      axisLabel: unit === '元' ? yuanAxisLabel : { color: INK_DIM },
    },
    yAxis: {
      type: 'category',
      data: list.map((row) => row.name),
      ...axisBase,
      axisLabel: { color: INK, fontSize: 13 },
    },
    series: [
      {
        name: unit === '元' ? '实收' : '销量',
        type: 'bar',
        barWidth: 14,
        itemStyle: { color: unit === '元' ? BRAND : COOL, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: INK_DIM,
          fontSize: 12,
          formatter: (params) =>
            unit === '元' ? `¥${fenToYuan(Number(params.value))}` : `${params.value} 份`,
        },
        // 金额这条轴直接吃「分」，显示时再换算成元，不做中途四舍五入
        data: list.map((row) => (unit === '元' ? row.valueCent : row.count)),
      },
    ],
  };
}

const dishOption = computed(() => rankOption(data.value?.topDishes ?? [], '份'));
const storeOption = computed(() => rankOption(data.value?.storeRank ?? [], '元'));
</script>

<template>
  <ScreenShell title="经营数据大屏" :subtitle="data?.scopeName" :updated-at="updatedAt" :error="error">
    <div class="grid">
      <section class="kpis">
        <div v-for="item in kpis" :key="item.label" class="kpi">
          <p class="kpi__label">{{ item.label }}</p>
          <p class="kpi__value" :class="item.tone ? `is-${item.tone}` : ''">{{ item.value }}</p>
          <p class="kpi__hint">{{ item.hint }}</p>
        </div>
        <div v-if="!kpis.length" class="kpi kpi--empty">
          {{ firstLoad ? '正在取数…' : error || '暂时没取到数据，稍后会自动重试' }}
        </div>
      </section>

      <ScreenPanel class="area-trend" title="近 14 天实收与单量" hint="金额按支付时间归日">
        <ScreenChart :option="trendOption" />
      </ScreenPanel>

      <ScreenPanel class="area-hourly" title="今日分时" hint="柱＝单量（左轴）· 线＝实收（右轴）">
        <ScreenChart :option="hourlyOption" />
      </ScreenPanel>

      <ScreenPanel class="area-mix" title="就餐方式占比" hint="只算付过钱的单">
        <ScreenChart v-if="data?.diningMix?.length" :option="diningOption" />
        <p v-else class="panel__empty">今天还没有成交</p>
      </ScreenPanel>

      <ScreenPanel class="area-dish" title="今日菜品销量 Top 10">
        <ScreenChart v-if="data?.topDishes?.length" :option="dishOption" />
        <p v-else class="panel__empty">今天还没有成交的菜品</p>
      </ScreenPanel>

      <ScreenPanel class="area-store" title="今日门店实收 Top 10">
        <ScreenChart v-if="data?.storeRank?.length" :option="storeOption" />
        <p v-else class="panel__empty">今天还没有门店收到钱</p>
      </ScreenPanel>

      <ScreenPanel class="area-live" title="实时单流" hint="最近 20 单">
        <ul class="live">
          <li v-for="row in data?.liveOrders ?? []" :key="row.orderNo" class="live__row">
            <span class="live__code">{{ row.pickupCode || row.tableNo || '—' }}</span>
            <span class="live__main">
              <span class="live__items">{{ row.itemsSummary }}</span>
              <span class="live__meta">{{ row.storeName }} · {{ row.minutesAgo }} 分钟前<template v-if="row.remark"> · {{ row.remark }}</template></span>
            </span>
            <span class="live__money">¥{{ fenToYuan(row.payableCent) }}</span>
          </li>
          <li v-if="!data?.liveOrders?.length" class="live__row live__row--empty">今天还没有成交的单</li>
        </ul>
      </ScreenPanel>
    </div>
  </ScreenShell>
</template>

<style scoped lang="scss">
/* 12 列 × 3 行的固定版式：换分辨率靠外壳整体缩放，这里不写断点 */
.grid {
  display: grid;
  height: 100%;
  grid-template-columns: repeat(12, 1fr);
  grid-template-rows: 132px minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 18px;
}

.kpis {
  grid-column: span 12;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 18px;
}

.kpi {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 14px 18px;
  border: 1px solid var(--screen-line);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(28, 40, 66, 0.85), rgba(16, 24, 42, 0.7));

  &__label {
    margin: 0;
    font-size: 14px;
    color: var(--screen-ink-2);
  }

  &__value {
    margin: 0;
    font-family: var(--screen-num);
    font-size: 34px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    color: var(--screen-ink);

    &.is-money {
      font-size: 40px;
      color: var(--screen-brand);
    }

    &.is-warn {
      color: var(--screen-warn);
    }

    &.is-ok {
      color: var(--screen-ok);
    }
  }

  &__hint {
    margin: 0;
    font-size: 12px;
    color: rgba(143, 160, 192, 0.75);
  }

  &--empty {
    grid-column: span 8;
    align-items: center;
    color: var(--screen-ink-2);
  }
}

.area-trend { grid-column: span 5; }
.area-hourly { grid-column: span 4; }
.area-mix { grid-column: span 3; }
.area-dish { grid-column: span 4; }
.area-store { grid-column: span 3; }
.area-live { grid-column: span 5; }

/* 空态要说人话：整块面板留白会被当成"屏坏了"，而这里其实只是今天还没人成交 */
.panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  font-size: 15px;
  color: var(--screen-ink-2);
}

.live {
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.live__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--screen-line);

  &--empty {
    color: var(--screen-ink-2);
    font-size: 14px;
  }
}

.live__code {
  flex: none;
  width: 62px;
  font-family: var(--screen-num);
  font-size: 20px;
  font-weight: 700;
  color: var(--screen-brand);
}

.live__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.live__items {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live__meta {
  font-size: 12px;
  color: var(--screen-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live__money {
  flex: none;
  font-family: var(--screen-num);
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
</style>
