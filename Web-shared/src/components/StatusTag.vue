<script setup lang="ts">
import { computed } from 'vue';
import {
  BUSINESS_STATUS_LABELS,
  BusinessStatus,
  COMMON_STATUS_LABELS,
  CommonStatus,
  DISH_STATUS_LABELS,
  DishStatus,
} from '../types/enums';

/**
 * 状态标签。
 *
 * 三类状态（启用/禁用、上下架、营业/打烊）语义不同，
 * 但展示形态一致，集中在这里避免各页面各写一套 el-tag 映射。
 */
const props = defineProps<{
  kind: 'common' | 'dish' | 'business';
  value: number;
  /**
   * 门店已被停用时传 true，营业状态让位给「已停用」。
   *
   * 停用不改 `businessStatus`（那是商家自己的营业开关，恢复启用后还要按原值显示），
   * 所以这个优先级只能落在展示层 —— 否则禁用中的门店会一直挂着「营业中」。
   */
  stopped?: boolean;
}>();

const text = computed<string>(() => {
  if (props.stopped) {
    return '已停用';
  }
  switch (props.kind) {
    case 'dish':
      return DISH_STATUS_LABELS[props.value as DishStatus] ?? '未知';
    case 'business':
      return BUSINESS_STATUS_LABELS[props.value as BusinessStatus] ?? '未知';
    default:
      return COMMON_STATUS_LABELS[props.value as CommonStatus] ?? '未知';
  }
});

const tagType = computed<'success' | 'info' | 'warning' | 'danger'>(() => {
  if (props.stopped) {
    return 'danger';
  }
  if (props.kind === 'dish') {
    return props.value === DishStatus.ON_SHELF ? 'success' : 'info';
  }
  if (props.kind === 'business') {
    return props.value === BusinessStatus.OPEN ? 'success' : 'warning';
  }
  return props.value === CommonStatus.ENABLED ? 'success' : 'info';
});
</script>

<template>
  <el-tag :type="tagType" effect="light" size="small" round>{{ text }}</el-tag>
</template>
