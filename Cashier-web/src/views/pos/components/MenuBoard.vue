<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import TableEmpty from '@shared/components/TableEmpty.vue';
import { activeSpecGroups, usePosMenu } from '@/hooks/usePosMenu';
import { useDraftStore } from '@/store/modules/draft';
import type { Dish } from '@shared/types/dish';
import DishTile from './DishTile.vue';

const emit = defineEmits<{ (e: 'pick', dish: Dish): void }>();

const menu = usePosMenu();
const draftStore = useDraftStore();
const { categories, dishes, visibleDishes, countByCategory, loading, loaded, activeCategoryId } =
  menu;
const { keyword } = menu;

/** 骨架占位：保持网格节奏，避免加载完成时整屏跳动 */
const skeletonTiles = Array.from({ length: 8 }, (_, index) => index);

const isReloading = ref(false);

/** 菜品可能在收银台缓存期间被下架 / 改价，这里给一个手动刷新入口 */
async function reload(): Promise<void> {
  isReloading.value = true;
  try {
    await menu.load();
  } finally {
    isReloading.value = false;
  }
}

onMounted(() => {
  void reload();
});

defineExpose({ reload });
</script>

<template>
  <section class="board">
    <!-- 分类 + 搜索：收银台的「找菜」两条路径，点按或打字 -->
    <div class="board__bar">
      <div class="board__cats">
        <button
          class="cat"
          :class="{ 'is-active': activeCategoryId === null }"
          type="button"
          @click="menu.selectCategory(null)"
        >
          全部
          <span v-if="dishes.length" class="num cat__count">{{ dishes.length }}</span>
        </button>

        <button
          v-for="category in categories"
          :key="category.id"
          class="cat"
          :class="{ 'is-active': activeCategoryId === category.id }"
          type="button"
          @click="menu.selectCategory(category.id)"
        >
          {{ category.name }}
          <span v-if="countByCategory[category.id]" class="num cat__count">
            {{ countByCategory[category.id] }}
          </span>
        </button>
      </div>

      <div class="board__tools">
        <el-input
          v-model="keyword"
          class="board__search"
          placeholder="搜菜名"
          :prefix-icon="Search"
          clearable
        />
        <el-button
          class="board__reload"
          :icon="Refresh"
          :loading="isReloading"
          circle
          title="刷新菜单"
          aria-label="刷新菜单"
          @click="reload"
        />
      </div>
    </div>

    <div class="board__scroll">
      <!-- 首次加载给骨架，之后的刷新保留原菜单可见（收银台不能出现空白等待） -->
      <div v-if="loading && !loaded" class="tile-grid">
        <div v-for="key in skeletonTiles" :key="key" class="tile-skeleton">
          <span class="tile-skeleton__media skeleton-line" />
          <span class="skeleton-line" style="width: 70%" />
          <span class="skeleton-line" style="width: 40%" />
        </div>
      </div>

      <div v-else-if="visibleDishes.length" class="tile-grid">
        <DishTile
          v-for="(dish, index) in visibleDishes"
          :key="dish.id"
          :dish="dish"
          :index="index"
          :has-specs="activeSpecGroups(dish).length > 0"
          :sold-out="dish.soldOut"
          :in-cart="draftStore.quantityOf(dish.id)"
          @pick="emit('pick', dish)"
        />
      </div>

      <TableEmpty
        v-else
        :filtered="keyword.trim() !== '' || activeCategoryId !== null"
        title="菜单是空的"
        hint="本店没有已上架的菜品；先在商户后台的「菜品管理」上架菜品，再回到收银台刷新菜单。"
      >
        <el-button :icon="Refresh" :loading="isReloading" @click="reload">刷新菜单</el-button>
      </TableEmpty>
    </div>
  </section>
</template>

<style scoped lang="scss">
.board {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;

  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background-color: var(--surface);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  &__cats {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  &__search {
    width: 168px;
  }

  &__reload {
    width: var(--touch-size);
    height: var(--touch-size);
  }

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5) var(--space-8);
  }
}

.cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background-color: var(--neutral-50);
  color: var(--text-regular);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    background-color: var(--brand-50);
    color: var(--brand-700);
  }

  &.is-active {
    background-color: var(--brand-500);
    border-color: var(--brand-500);
    color: #fff;
    font-weight: 500;
    box-shadow: var(--shadow-brand);
  }

  &__count {
    font-size: 11px;
    opacity: 0.72;
  }
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-min-width), 1fr));
  gap: var(--space-3);
}

.tile-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
  padding: 0 12px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);

  &__media {
    height: 84px;
    margin: 0 -12px 8px;
    border-radius: 0;
  }
}
</style>
