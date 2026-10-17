<script setup lang="ts">
import { computed } from 'vue';
import ScreenChart from '@shared/components/screen/ScreenChart.vue';
import ScreenPanel from '@shared/components/screen/ScreenPanel.vue';
import ScreenShell from '@shared/components/screen/ScreenShell.vue';
import { fetchPlatformScreen } from '@shared/api/statistics';
import { useScreenPolling } from '@shared/hooks/useScreenPolling';
import { fenToYuan } from '@shared/utils/format';
import type { EChartsOption } from 'echarts';

/**
 * 平台端数据大屏：看的是「这个平台今天在做多少生意」。
 *
 * 与商家屏同一套外壳与色板，但排行换成商户维度，并多出支付渠道占比 ——
 * 平台关心钱从哪个渠道进来（真实渠道接了几个、还有多少在走线下）。
 */
const { data, error, updatedAt } = useScreenPolling(fetchPlatformScreen);

const INK = '#e8eefb';
const INK_DIM = '#8fa0c0';
const LINE = 'rgba(140, 165, 205, 0.16)';
const BRAND = '#f0a94b';
const COOL = '#4fb0e5';
const PIE_COLORS = [BRAND, COOL, '#3ecf8e', '#b98cf0', '#f2748a'];

const kpis = computed(() => {
  const value = data.value?.overview;
  if (!value) {
    return [];
  }
  return [
    { label: '今日实收', value: `¥${fenToYuan(value.revenueCent)}`, tone: 'money', hint: `退款 ¥${fenToYuan(value.refundCent)}` },
    { label: '成交单数', value: String(value.paidOrderCount), hint: `下单 ${value.orderCount} · 取消 ${value.cancelledCount}` },
    { label: '客单价', value: `¥${fenToYuan(value.avgOrderCent)}`, hint: '实收 / 成交单数' },
    { label: '待接单', value: String(value.pendingCount), tone: 'warn', hint: '商家还没点接单' },
    { label: '今日新客', value: String(value.newCustomerCount), hint: '账号注册在今日' },
    { label: '有成交门店', value: String(value.activeStoreCount), hint: '今日收到过钱的店' },
  ];
});

const totals = computed(() => {
  const value = data.value?.totals;
  if (!value) {
    return [];
  }
  return [
    { label: '入驻商户', value: value.merchants },
    { label: '门店', value: value.stores },
    { label: '顾客账号', value: value.customers },
  ];
});

const axisBase = {
  axisLine: { lineStyle: { color: LINE } },
  axisTick: { show: false },
  axisLabel: { color: INK_DIM, fontSize: 12 },
};

const trendOption = computed<EChartsOption>(() => {
  const rows = data.value?.trend ?? [];
  return {
    grid: { left: 72, right: 52, top: 34, bottom: 28 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['实收（元）', '单量'], textStyle: { color: INK_DIM, fontSize: 12 }, top: 0, right: 0 },
    xAxis: { type: 'category', data: rows.map((row) => row.date.slice(5)), ...axisBase },
    yAxis: [
      { type: 'value', name: '元', splitLine: { lineStyle: { color: LINE } }, axisLabel: { color: INK_DIM }, nameTextStyle: { color: INK_DIM } },
      { type: 'value', name: '单', splitLine: { show: false }, axisLabel: { color: INK_DIM }, nameTextStyle: { color: INK_DIM } },
    ],
    series: [
      {
        name: '实收（元）',
        type: 'bar',
        barWidth: 10,
        itemStyle: { color: BRAND, borderRadius: [3, 3, 0, 0] },
        data: rows.map((row) => row.revenueCent / 100),
      },
      {
        name: '单量',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: COOL, width: 2 },
        itemStyle: { color: COOL },
        data: rows.map((row) => row.orderCount),
      },
    ],
  };
});

const channelOption = computed<EChartsOption>(() => {
  const rows = data.value?.channelMix ?? [];
  return {
    color: PIE_COLORS,
    tooltip: { trigger: 'item', formatter: '{b}：{c} 笔（{d}%）' },
    legend: { bottom: 0, textStyle: { color: INK_DIM, fontSize: 12 }, itemWidth: 10, itemHeight: 10 },
    series: [
      {
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: '#0a1120', borderWidth: 2 },
        label: { color: INK, fontSize: 13, formatter: '{b}\n{d}%' },
        labelLine: { length: 8, length2: 10 },
        data: rows.map((row) => ({ name: row.label, value: row.count })),
      },
    ],
  };
});

function rankOption(rows: Array<{ name: string; valueCent: number }>): EChartsOption {
  const list = [...rows].reverse();
  return {
    grid: { left: 108, right: 56, top: 12, bottom: 18 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: LINE } }, axisLabel: { color: INK_DIM } },
    yAxis: {
      type: 'category',
      data: list.map((row) => row.name),
      ...axisBase,
      axisLabel: { color: INK, fontSize: 13, width: 100, overflow: 'truncate' },
    },
    series: [
      {
        name: '实收（元）',
        type: 'bar',
        barWidth: 14,
        itemStyle: { color: BRAND, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: INK_DIM,
          fontSize: 12,
          formatter: (params) => Number(params.value).toLocaleString('zh-CN'),
        },
        data: list.map((row) => Math.round(row.valueCent / 100)),
      },
    ],
  };
}

const merchantOption = computed(() => rankOption(data.value?.merchantRank ?? []));
const storeOption = computed(() => rankOption(data.value?.storeRank ?? []));
</script>

<template>
  <ScreenShell title="平台经营大屏" subtitle="全平台" :updated-at="updatedAt" :error="error">
    <div class="grid">
      <section class="kpis">
        <div v-for="item in kpis" :key="item.label" class="kpi">
          <p class="kpi__label">{{ item.label }}</p>
          <p class="kpi__value" :class="item.tone ? `is-${item.tone}` : ''">{{ item.value }}</p>
          <p class="kpi__hint">{{ item.hint }}</p>
        </div>
        <div v-if="!kpis.length" class="kpi kpi--empty">正在取数…</div>
      </section>

      <ScreenPanel class="area-trend" title="近 30 天实收与单量" hint="金额按支付时间归日">
        <ScreenChart :option="trendOption" />
      </ScreenPanel>

      <ScreenPanel class="area-channel" title="今日支付渠道占比" hint="含线下收款">
        <ScreenChart :option="channelOption" />
      </ScreenPanel>

      <ScreenPanel class="area-totals" title="平台盘子">
        <ul class="totals">
          <li v-for="item in totals" :key="item.label" class="totals__row">
            <span class="totals__label">{{ item.label }}</span>
            <strong class="totals__value">{{ item.value }}</strong>
          </li>
          <li v-if="!totals.length" class="totals__row">正在取数…</li>
        </ul>
      </ScreenPanel>

      <ScreenPanel class="area-merchant" title="今日商户实收 Top 10">
        <ScreenChart :option="merchantOption" />
      </ScreenPanel>

      <ScreenPanel class="area-store" title="今日门店实收 Top 10">
        <ScreenChart :option="storeOption" />
      </ScreenPanel>

      <ScreenPanel class="area-live" title="全站实时单流" hint="最近 20 单">
        <ul class="live">
          <li v-for="row in data?.liveOrders ?? []" :key="row.orderNo" class="live__row">
            <span class="live__code">{{ row.pickupCode || row.tableNo || '—' }}</span>
            <span class="live__main">
              <span class="live__items">{{ row.itemsSummary }}</span>
              <span class="live__meta">{{ row.storeName }} · {{ row.minutesAgo }} 分钟前</span>
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
  grid-template-columns: repeat(6, 1fr);
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
    font-size: 36px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    color: var(--screen-ink);

    &.is-money {
      font-size: 42px;
      color: var(--screen-brand);
    }

    &.is-warn {
      color: var(--screen-warn);
    }
  }

  &__hint {
    margin: 0;
    font-size: 12px;
    color: rgba(143, 160, 192, 0.75);
  }

  &--empty {
    grid-column: span 6;
    align-items: center;
    color: var(--screen-ink-2);
  }
}

.area-trend { grid-column: span 6; }
.area-channel { grid-column: span 3; }
.area-totals { grid-column: span 3; }
.area-merchant { grid-column: span 4; }
.area-store { grid-column: span 4; }
.area-live { grid-column: span 4; }

.totals {
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
}

.totals__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--screen-line);
}

.totals__label {
  font-size: 15px;
  color: var(--screen-ink-2);
}

.totals__value {
  font-family: var(--screen-num);
  font-size: 32px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
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
  padding: 8px 0;
  border-bottom: 1px dashed var(--screen-line);

  &--empty {
    color: var(--screen-ink-2);
    font-size: 14px;
  }
}

.live__code {
  flex: none;
  width: 58px;
  font-family: var(--screen-num);
  font-size: 19px;
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
  font-size: 14px;
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
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
</style>
