<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Shop, SwitchButton, User } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import { navItems } from '@/router/routes';
import { resolveIcon } from '@/utils/icons';
import { useDraftStore } from '@/store/modules/draft';
import { useTerminalStore } from '@/store/modules/terminal';
import { useUserStore } from '@/store/modules/user';
import { BusinessStatus } from '@shared/types/enums';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const terminalStore = useTerminalStore();
const draftStore = useDraftStore();

/** 按权限点过滤导航（前端只做展示控制，安全边界在服务端） */
const visibleNavItems = computed(() =>
  navItems.filter((item) => userStore.hasPermission(item.permission)),
);

/** 非导航页面（个人中心）用 meta.activeMenu 指定高亮 */
const activePath = computed(() => route.meta.activeMenu ?? route.path);
const initial = computed(() => (userStore.displayName || 'C').slice(0, 1).toUpperCase());

/** 停用优先于打烊：禁用中的门店开单会被服务端拒，不能还挂着「营业中」 */
const businessLabel = computed(() => {
  const store = terminalStore.store;
  if (!store) {
    return '';
  }
  if (terminalStore.isStopped) {
    return '已停用';
  }
  return store.businessStatus === BusinessStatus.OPEN ? '营业中' : '打烊中';
});

/* ---------------- 时钟 ---------------- */

const now = ref(new Date());
let timer: number | undefined;

const clock = computed(() => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}`;
});

const weekday = computed(() => '日一二三四五六'[now.value.getDay()]);

onMounted(() => {
  // 收银台常亮不关，跨天后日期与星期必须自己跟上
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 15_000);
});

onBeforeUnmount(() => {
  if (timer !== undefined) {
    window.clearInterval(timer);
  }
});

/* ---------------- 账号菜单 ---------------- */

async function handleCommand(command: string): Promise<void> {
  if (command === 'profile') {
    await router.push({ name: 'Profile' });
    return;
  }

  if (command !== 'logout') {
    return;
  }

  try {
    await ElMessageBox.confirm(
      draftStore.isEmpty
        ? '退出后需要重新登录，确定要退出当前收银账号吗？'
        : `当前草稿单还有 ${draftStore.dishCount} 件未结算，退出会一并清空。确定退出吗？`,
      '退出收银台',
      { type: 'warning', confirmButtonText: '退出登录', cancelButtonText: '继续收银' },
    );
  } catch {
    return;
  }

  // 换班是收银台的常态场景：退出时必须清掉草稿与门店上下文，
  // 否则下一班会看到上一班打到一半的单。
  draftStore.reset();
  terminalStore.clear();
  await userStore.logout();
  await router.replace({ name: 'Login' });
}
</script>

<template>
  <header class="chrome">
    <div class="chrome__brand">
      <span class="chrome__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="20" height="20">
          <path
            d="M21 17h22v30l-3.6-2.4L35.8 47l-3.8-2.4L28.2 47l-3.6-2.4L21 47Z"
            fill="none"
            stroke="#fff"
            stroke-width="5"
            stroke-linejoin="round"
          />
          <path
            d="M26 26h12M26 33h8"
            fill="none"
            stroke="#fff"
            stroke-width="5"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <span class="chrome__wordmark">
        <strong>Ordering</strong>
        <em>收银台</em>
      </span>
    </div>

    <div class="chrome__store">
      <el-icon class="chrome__store-icon"><Shop /></el-icon>
      <span class="chrome__store-name">{{ terminalStore.storeName || '加载中…' }}</span>
      <span
        v-if="businessLabel"
        class="chrome__store-state"
        :class="{ 'is-closed': terminalStore.isClosed }"
      >
        {{ businessLabel }}
      </span>
    </div>

    <nav class="chrome__nav" aria-label="收银台通道">
      <router-link
        v-for="item in visibleNavItems"
        :key="item.path"
        class="chrome__nav-item"
        :class="{ 'is-active': activePath === item.path }"
        :to="item.path"
      >
        <el-icon><component :is="resolveIcon(item.icon)" /></el-icon>
        <span>{{ item.navLabel }}</span>
      </router-link>
    </nav>

    <div class="chrome__right">
      <span class="chrome__clock num">{{ clock }}</span>
      <span class="chrome__weekday">周{{ weekday }}</span>

      <el-dropdown trigger="click" @command="handleCommand">
        <button class="chrome__user" type="button">
          <span class="chrome__avatar">{{ initial }}</span>
          <span class="chrome__user-text">
            <strong>{{ userStore.displayName }}</strong>
            <em>{{ userStore.roleLabel }}</em>
          </span>
          <el-icon class="chrome__caret"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile" :icon="User">我的账号</el-dropdown-item>
            <el-dropdown-item command="logout" :icon="SwitchButton" divided
              >退出登录</el-dropdown-item
            >
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped lang="scss">
.chrome {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  height: var(--chrome-height);
  flex-shrink: 0;
  padding: 0 var(--space-5);
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 10px 26px -20px rgba(0, 0, 0, 0.9);

  /* ---------------- 品牌 ---------------- */
  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  &__mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    box-shadow: 0 6px 16px -8px rgba(194, 96, 60, 0.8);
  }

  &__wordmark {
    display: flex;
    flex-direction: column;
    line-height: 1.12;
    white-space: nowrap;

    strong {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--sidebar-text-strong);
    }

    em {
      font-size: 10.5px;
      font-style: normal;
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.38);
    }
  }

  /* ---------------- 门店 ---------------- */
  &__store {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 12px 6px 10px;
    border-radius: var(--radius-full);
    background-color: var(--sidebar-bg-soft);
  }

  &__store-icon {
    font-size: 15px;
    color: var(--brand-400);
  }

  &__store-name {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.86);
  }

  &__store-state {
    padding: 1px 8px;
    border-radius: var(--radius-full);
    background-color: rgba(63, 143, 99, 0.18);
    color: #8fc7a9;
    font-size: 11px;
    white-space: nowrap;

    &.is-closed {
      background-color: rgba(184, 128, 31, 0.2);
      color: #dcb268;
    }
  }

  /* ---------------- 通道导航：分段控件形态 ---------------- */
  &__nav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-full);
    background-color: rgba(255, 255, 255, 0.05);
    margin-left: auto;
  }

  &__nav-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: var(--touch-size);
    padding: 0 18px;
    border-radius: var(--radius-full);
    color: var(--sidebar-text);
    font-size: 13.5px;
    white-space: nowrap;
    transition:
      background-color var(--duration-base) var(--ease-out-quart),
      color var(--duration-base) var(--ease-out-quart);

    .el-icon {
      font-size: 17px;
    }

    &:hover {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.07);
    }

    /* 选中态用整块品牌色，触屏上一眼能确认自己在哪个通道 */
    &.is-active {
      color: #fff;
      background: linear-gradient(120deg, var(--brand-500), var(--brand-700));
      font-weight: 500;
      box-shadow: 0 8px 20px -12px rgba(194, 96, 60, 0.9);
    }
  }

  /* ---------------- 右侧：时钟 + 账号 ---------------- */
  &__right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  &__clock {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: rgba(255, 255, 255, 0.92);
  }

  &__weekday {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.4);
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: var(--touch-size);
    padding: 4px 12px 4px 5px;
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    background-color: transparent;
    color: inherit;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out-quart),
      border-color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      background-color: rgba(255, 255, 255, 0.06);
      border-color: var(--sidebar-divider);
    }
  }

  &__avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    background: linear-gradient(140deg, var(--brand-400), var(--brand-700));
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }

  &__user-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.2;

    strong {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.92);
    }

    em {
      font-size: 10.5px;
      font-style: normal;
      color: rgba(255, 255, 255, 0.4);
    }
  }

  &__caret {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
  }
}

/* 窄屏（如 1366 宽的副屏）：隐藏次要信息，保证导航与合计可用 */
@media (max-width: 1180px) {
  .chrome {
    &__wordmark,
    &__weekday {
      display: none;
    }
  }
}

@media (max-width: 900px) {
  .chrome {
    gap: var(--space-3);

    &__store-name {
      max-width: 96px;
    }

    &__user-text {
      display: none;
    }
  }
}
</style>
