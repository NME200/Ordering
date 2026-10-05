<script setup lang="ts">
import { computed } from 'vue';

/** 表格分页条：左显示总数，右为分页器 */
const props = defineProps<{
  total: number;
  page: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  (e: 'page-change', page: number): void;
  (e: 'size-change', size: number): void;
}>();

const currentPage = computed({
  get: () => props.page,
  set: (value: number) => emit('page-change', value),
});

const currentPageSize = computed({
  get: () => props.pageSize,
  set: (value: number) => emit('size-change', value),
});
</script>

<template>
  <div class="table-pagination">
    <span class="table-pagination__total num">共 {{ total }} 条</span>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="currentPageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="sizes, prev, pager, next, jumper"
      background
    />
  </div>
</template>

<style scoped lang="scss">
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--neutral-100);

  &__total {
    font-size: 13px;
    color: var(--text-secondary);
  }
}
</style>
