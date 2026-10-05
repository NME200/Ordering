<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { menuItems } from '@/router/routes';
import { useUserStore } from '@/store/modules/user';
import { resolveIcon } from '@/utils/icons';

defineProps<{ collapsed: boolean }>();

const route = useRoute();
const userStore = useUserStore();

/** 按角色 + 权限过滤菜单（前端只做展示控制，安全边界在服务端） */
const visibleMenus = computed(
  () =>
    menuItems.filter(
      (item) => userStore.hasRole(item.roles) && userStore.hasPermission(item.permission),
    ),
);

/** 详情页等非菜单页面通过 meta.activeMenu 指定高亮的菜单项 */
const activeMenu = computed(() => route.meta.activeMenu ?? route.path);
</script>

<template>
  <aside class="sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar__brand">
      <span class="sidebar__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="22" height="22">
          <path
            d="M18 41c0-7.7 6.3-14 14-14s14 6.3 14 14"
            fill="none"
            stroke="#fff"
            stroke-width="6"
            stroke-linecap="round"
          />
          <path d="M14 47h36" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
          <circle cx="32" cy="19" r="4" fill="#fff" />
        </svg>
      </span>
      <span v-show="!collapsed" class="sidebar__wordmark">
        <strong>Ordering</strong>
        <em>平台管理后台</em>
      </span>
    </div>

    <el-scrollbar class="sidebar__scroll is-dark-scroll">
      <el-menu
        class="sidebar__menu"
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        router
      >
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          <el-icon><component :is="resolveIcon(item.icon)" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>

    <div v-show="!collapsed" class="sidebar__foot">
      <span class="sidebar__foot-dot" aria-hidden="true" />
      <span>多商户 SaaS 点餐系统</span>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: var(--sidebar-width);
  background-color: var(--sidebar-bg);
  transition: width var(--duration-base) var(--ease-out-quart);
  overflow: hidden;

  &.is-collapsed {
    width: var(--sidebar-width-collapsed);
  }

  /* ---------- 品牌区 ---------- */
  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: var(--header-height);
    padding: 0 16px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sidebar-divider);
  }

  &__mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 9px;
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    box-shadow: 0 4px 12px -4px rgba(194, 96, 60, 0.6);
  }

  &__wordmark {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    white-space: nowrap;

    strong {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--sidebar-text-strong);
    }

    em {
      font-size: 11px;
      font-style: normal;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.42);
    }
  }

  /* ---------- 菜单 ---------- */
  &__scroll {
    flex: 1;
    min-height: 0;
  }

  &__menu {
    padding: 10px 0;
    border-right: none;
    background-color: transparent;

    --el-menu-bg-color: transparent;
    --el-menu-text-color: var(--sidebar-text);
    --el-menu-active-color: var(--sidebar-text-strong);
    --el-menu-hover-bg-color: rgba(255, 255, 255, 0.07);
    --el-menu-item-height: 42px;
    --el-menu-base-level-padding: 14px;
    --el-menu-collapse-width: var(--sidebar-width-collapsed);
  }

  &__menu :deep(.el-menu-item) {
    position: relative;
    margin: 3px 10px;
    border-radius: var(--radius-md);
    font-size: 13.5px;
    letter-spacing: 0.01em;
    transition: background-color var(--duration-fast) var(--ease-out-quart),
      color var(--duration-fast) var(--ease-out-quart);
  }

  &__menu :deep(.el-menu-item .el-icon) {
    font-size: 17px;
    margin-right: 10px;
  }

  /* 选中态：品牌色渐变底 + 左侧竖条，克制但明确 */
  &__menu :deep(.el-menu-item.is-active) {
    background: linear-gradient(
      90deg,
      rgba(194, 96, 60, 0.34) 0%,
      rgba(194, 96, 60, 0.12) 100%
    );
    font-weight: 500;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 0 3px 3px 0;
      background-color: var(--brand-400);
    }
  }

  &.is-collapsed &__menu :deep(.el-menu-item) {
    margin: 3px 8px;
  }

  /* ---------- 底部说明 ---------- */
  &__foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px 16px;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.32);
    white-space: nowrap;
  }

  &__foot-dot {
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background-color: var(--success-500);
    box-shadow: 0 0 0 3px rgba(63, 143, 99, 0.18);
  }
}
</style>
