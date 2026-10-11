<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import LineIcon from '@/components/LineIcon.vue';
import type { SectionProps } from '@/types/api';
import type { MemberTask } from '@/types/customer';

/**
 * 成长任务列表（ui.md 第 15 节）。
 *
 * 配置只给文案与顺序，**进度一律来自接口的真实任务**：
 * 装修端 items 的形状是 `{ text, btnText }`，没有 key，所以这里按顺序与接口任务对齐 ——
 * 配置多出来的项（接口里没有的任务）直接丢掉，不画一条「0 / 1」的假任务行。
 */
export default defineComponent({
  name: 'DiyTaskList',
  components: { LineIcon },
  props: {
    config: { type: Object as PropType<SectionProps>, required: true },
    /** 接口的真实任务；空数组 = 还没拿到数据或没进店 */
    tasks: { type: Array as PropType<MemberTask[]>, default: () => [] },
  },
  emits: { pick: (_key: string) => true },
  setup(props) {
    interface TaskRow {
      key: string;
      label: string;
      progress: string;
      percent: number;
      done: boolean;
      btn: string;
    }

    const rows = computed<TaskRow[]>(() =>
      (props.tasks ?? []).map((task, index) => {
        const configured = props.config.items?.[index];
        const target = task.target > 0 ? task.target : 0;
        return {
          key: task.key,
          // 平台文案优先（是给人看的营销话术），没配就用后端的 label
          label: configured?.text || task.label,
          progress: `${task.current}/${target}${task.unit || ''}`,
          percent: target ? Math.min(100, Math.round((task.current / target) * 100)) : 0,
          done: task.done,
          btn: configured?.btnText || '去完成',
        };
      }),
    );

    const title = computed(() => props.config.title || '成长任务');
    const emptyText = computed(() => props.config.emptyText || '进店后可见');

    return { rows, title, emptyText };
  },
});
</script>

<template>
  <view class="task card">
    <text class="task__title">{{ title }}</text>

    <block v-if="rows.length">
      <view v-for="row in rows" :key="row.key" class="task__row">
        <view class="task__main">
          <view class="task__line">
            <text class="task__label">{{ row.label }}</text>
            <view
              v-if="row.done"
              class="task__done"
            >
              <LineIcon name="check" :size="14" tone="brand" />
              <text class="task__done-text">已完成</text>
            </view>
            <view v-else class="task__btn" @click="$emit('pick', row.key)">
              <text class="task__btn-text">{{ row.btn }}</text>
            </view>
          </view>
          <view class="task__bar">
            <view class="task__bar-fill" :style="`width:${row.percent}%`" />
          </view>
          <text class="task__progress num">{{ row.progress }}</text>
        </view>
      </view>
    </block>

    <view v-else class="task__empty">
      <text>{{ emptyText }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.task {
  padding: 28rpx 28rpx 12rpx;
}

.task__title {
  display: block;
  padding-bottom: 8rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand-sub, #{$n-700});
}

.task__row {
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--divider, #{$n-200});
}

.task__row:last-child {
  border-bottom: none;
}

.task__main {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.task__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.task__label {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: var(--ink, #{$n-900});
}

.task__btn {
  flex: none;
  height: 56rpx;
  padding: 0 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
}

.task__btn:active {
  opacity: 0.85;
}

.task__btn-text {
  font-size: 24rpx;
  color: #fff;
  font-weight: 600;
}

/* 已完成不给按钮：留着会让顾客以为还能再点一次领一遍 */
.task__done {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.task__done-text {
  font-size: 24rpx;
  color: var(--ink-2, #{$n-500});
}

.task__bar {
  height: 8rpx;
  border-radius: 999rpx;
  background-color: var(--divider, #{$n-200});
  overflow: hidden;
}

.task__bar-fill {
  height: 100%;
  border-radius: 999rpx;
  background-color: var(--brand, #c8752b);
  transition: width 0.24s ease;
}

.task__progress {
  font-size: 22rpx;
  color: var(--ink-2, #{$n-500});
}

.task__empty {
  padding: 32rpx 0 24rpx;
  font-size: 26rpx;
  color: var(--ink-2, #{$n-400});
  text-align: center;
}
</style>
