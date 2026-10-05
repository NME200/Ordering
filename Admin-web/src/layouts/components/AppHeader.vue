<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Expand, Fold, SwitchButton, User } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/store/modules/user';

defineProps<{ collapsed: boolean }>();
defineEmits<{ (e: 'toggle'): void }>();

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const pageTitle = computed(() => route.meta.title ?? '');
const parentTitle = computed(() => route.meta.parentTitle ?? '');
const parentPath = computed(() => route.meta.activeMenu ?? '');
const initial = computed(() => (userStore.displayName || 'U').slice(0, 1).toUpperCase());

/** 用户下拉菜单指令 */
async function handleCommand(command: string): Promise<void> {
  if (command === 'profile') {
    await router.push({ name: 'Profile' });
    return;
  }

  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('退出后需要重新登录，确定要退出当前账号吗？', '退出登录', {
        type: 'warning',
        confirmButtonText: '退出登录',
        cancelButtonText: '再想想',
      });
    } catch {
      // 用户取消，不做任何事
      return;
    }
    await userStore.logout();
    await router.replace({ name: 'Login' });
  }
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button
        class="app-header__icon-btn"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="$emit('toggle')"
      >
        <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
      </button>

      <nav class="app-header__crumbs" aria-label="面包屑">
        <span class="app-header__crumb-root">首页</span>
        <template v-if="parentTitle">
          <el-icon class="app-header__crumb-sep"><ArrowDown /></el-icon>
          <router-link class="app-header__crumb-link" :to="parentPath">{{ parentTitle }}</router-link>
        </template>
        <el-icon class="app-header__crumb-sep"><ArrowDown /></el-icon>
        <span class="app-header__crumb-current">{{ pageTitle }}</span>
      </nav>
    </div>

    <div class="app-header__right">
      <span class="app-header__role">{{ userStore.roleLabel }}</span>

      <el-dropdown trigger="click" @command="handleCommand">
        <button class="app-header__user" type="button">
          <span class="app-header__avatar">{{ initial }}</span>
          <span class="app-header__name">{{ userStore.displayName }}</span>
          <el-icon class="app-header__caret"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile" :icon="User">个人中心</el-dropdown-item>
            <el-dropdown-item command="logout" :icon="SwitchButton" divided>退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--header-height);
  flex-shrink: 0;
  padding: 0 var(--space-6) 0 var(--space-4);
  background-color: var(--surface);
  border-bottom: 1px solid var(--border-color);

  &__left,
  &__right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  &__icon-btn {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: var(--radius-md);
    background-color: transparent;
    color: var(--text-secondary);
    font-size: 17px;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out-quart),
      color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      background-color: var(--neutral-100);
      color: var(--text-primary);
    }
  }

  &__crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    min-width: 0;
  }

  &__crumb-root {
    color: var(--text-placeholder);
  }

  &__crumb-link {
    color: var(--text-secondary);
    transition: color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      color: var(--brand-600);
    }
  }

  &__crumb-sep {
    font-size: 11px;
    color: var(--neutral-300);
    transform: rotate(-90deg);
  }

  &__crumb-current {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__role {
    padding: 3px 10px;
    border-radius: var(--radius-full);
    background-color: var(--brand-50);
    color: var(--brand-700);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 10px 0 6px;
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    background-color: transparent;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out-quart),
      border-color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      background-color: var(--neutral-50);
      border-color: var(--border-color);
    }
  }

  &__avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }

  &__name {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-primary);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__caret {
    font-size: 12px;
    color: var(--text-placeholder);
  }
}

/* 小屏下隐藏次要信息，保留核心操作 */
@media (max-width: 720px) {
  .app-header {
    padding-right: var(--space-4);

    &__role,
    &__name {
      display: none;
    }
  }
}
</style>
