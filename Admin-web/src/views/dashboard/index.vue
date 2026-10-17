<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Bowl, OfficeBuilding, Shop, UserFilled } from '@element-plus/icons-vue';
import {
  fetchDishTotal,
  fetchMerchantTotal,
  fetchStoreTotal,
  fetchUserTotal,
} from '@shared/api/overview';
import PageHeader from '@shared/components/PageHeader.vue';
import { Permission, Role } from '@shared/types/enums';
import { useUserStore } from '@/store/modules/user';

const router = useRouter();
const userStore = useUserStore();

/** 大屏用新标签页打开：挂墙的屏不该把正在处理的后台页面顶掉 */
function openScreen(): void {
  window.open(router.resolve('/screen').href, '_blank', 'noopener');
}

/**
 * 统计卡片定义。
 *
 * 平台视角只看「治理规模」：商户、门店、账号、菜品四个口径。
 * 菜品分类 / 规格组这类经营细节不占平台概览，需要时进商户详情查看。
 * `to` 为空的卡片表示没有对应的平台页面，仅作数据展示。
 */
interface StatTile {
  key: string;
  label: string;
  hint: string;
  permission: Permission;
  loader: () => Promise<number>;
  /** 点击跳转的目标；为空表示不可点击 */
  to?: string;
}

/**
 * 账号入口按角色分流：平台账户只对平台管理员开放，
 * 被授权的运营专员应落在「商家账户」，点进平台账户只会吃一个 403。
 */
const accountsPath = computed(() =>
  userStore.isPlatformAdmin ? '/accounts/platform' : '/accounts/merchants',
);

const tileDefinitions = computed<StatTile[]>(() => [
  {
    key: 'merchant',
    label: '商户总数',
    hint: '平台在册租户',
    to: '/merchants',
    permission: Permission.MERCHANT_READ,
    loader: fetchMerchantTotal,
  },
  {
    key: 'store',
    label: '门店总数',
    hint: '平台全部门店',
    permission: Permission.STORE_READ,
    loader: fetchStoreTotal,
  },
  {
    key: 'user',
    label: '账号总数',
    hint: '含各角色账号',
    to: accountsPath.value,
    permission: Permission.USER_READ,
    loader: fetchUserTotal,
  },
  {
    key: 'dish',
    label: '菜品总数',
    hint: '平台全部菜品',
    permission: Permission.DISH_READ,
    loader: fetchDishTotal,
  },
]);

const visibleTiles = computed(() =>
  tileDefinitions.value.filter((tile) => userStore.hasPermission(tile.permission)),
);

const loading = ref(true);
const totals = ref<Record<string, number | null>>({});

/**
 * 快捷入口：平台职责范围内的常用入口。
 * 与统计卡片分开定义 —— 卡片标题是指标名，入口要写动作对象，两者语义不同。
 */
const shortcutDefinitions = computed(() => [
  {
    key: 'merchant',
    to: '/merchants',
    label: '商户管理',
    permission: Permission.MERCHANT_READ,
  },
  {
    key: 'user',
    to: accountsPath.value,
    label: '账号管理',
    permission: Permission.USER_READ,
  },
]);

const shortcuts = computed(() =>
  shortcutDefinitions.value.filter((item) => userStore.hasPermission(item.permission)),
);

const iconMap: Record<string, typeof Bowl> = {
  merchant: OfficeBuilding,
  store: Shop,
  user: UserFilled,
  dish: Bowl,
};

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const scopeText = computed(() => {
  if (userStore.profile?.role === Role.PLATFORM_ADMIN) {
    return '全部商户';
  }
  if (userStore.profile?.merchantId) {
    return `商户 #${userStore.profile.merchantId}`;
  }
  return '当前账号可见范围';
});

onMounted(async () => {
  // 各卡片独立取数，任一失败不影响其它卡片
  const results = await Promise.allSettled(visibleTiles.value.map((tile) => tile.loader()));
  const next: Record<string, number | null> = {};
  results.forEach((result, index) => {
    const tile = visibleTiles.value[index];
    next[tile.key] = result.status === 'fulfilled' ? result.value : null;
  });
  totals.value = next;
  loading.value = false;
});
</script>

<template>
  <div class="page">
    <PageHeader
      :title="`${greeting}，${userStore.displayName}`"
      :description="`平台治理概览 · 数据范围：${scopeText}`"
    >
      <template #actions>
        <!-- 大屏用新标签页打开：挂墙的屏不该把正在处理的后台页面顶掉 -->
        <el-button plain @click="openScreen">平台大屏</el-button>
      </template>
    </PageHeader>

    <!-- 统计卡片 -->
    <section class="stats">
      <article
        v-for="(tile, index) in visibleTiles"
        :key="tile.key"
        class="stat rise-in"
        :class="{ 'stat--static': !tile.to }"
        :style="{ animationDelay: `${index * 40}ms` }"
        :role="tile.to ? 'link' : undefined"
        :tabindex="tile.to ? 0 : undefined"
        @click="tile.to && router.push(tile.to)"
        @keyup.enter="tile.to && router.push(tile.to)"
      >
        <div class="stat__head">
          <span class="stat__label">{{ tile.label }}</span>
          <el-icon class="stat__icon"><component :is="iconMap[tile.key]" /></el-icon>
        </div>

        <div class="stat__value num">
          <span v-if="loading" class="skeleton-line stat__skeleton" />
          <template v-else-if="totals[tile.key] !== null">
            {{ totals[tile.key] }}
          </template>
          <span v-else class="stat__error">—</span>
        </div>

        <div class="stat__foot">
          <span>{{ totals[tile.key] === null && !loading ? '数据获取失败' : tile.hint }}</span>
          <el-icon v-if="tile.to" class="stat__arrow"><ArrowRight /></el-icon>
        </div>
      </article>
    </section>

    <!-- 快捷入口 + 账号信息 -->
    <section class="panels">
      <div class="panel panel--flush">
        <header class="panel__head">
          <h2>快捷入口</h2>
          <p>平台职责范围内的入口</p>
        </header>
        <div class="shortcuts">
          <button
            v-for="item in shortcuts"
            :key="item.key"
            class="shortcut"
            type="button"
            @click="router.push(item.to)"
          >
            <el-icon class="shortcut__icon"><component :is="iconMap[item.key]" /></el-icon>
            <span>{{ item.label }}</span>
            <el-icon class="shortcut__arrow"><ArrowRight /></el-icon>
          </button>
        </div>
      </div>

      <div class="panel panel--flush">
        <header class="panel__head">
          <h2>当前账号</h2>
          <p>权限点由服务端下发，前端仅作展示控制</p>
        </header>
        <dl class="account">
          <div class="account__row">
            <dt>用户名</dt>
            <dd class="num">{{ userStore.profile?.username || '—' }}</dd>
          </div>
          <div class="account__row">
            <dt>角色</dt>
            <dd>{{ userStore.roleLabel || '—' }}</dd>
          </div>
          <div class="account__row">
            <dt>所属商户</dt>
            <dd class="num">{{ userStore.profile?.merchantId ?? '平台级' }}</dd>
          </div>
          <div class="account__row">
            <dt>所属门店</dt>
            <dd class="num">{{ userStore.profile?.storeId ?? '—' }}</dd>
          </div>
          <div class="account__row">
            <dt>权限点</dt>
            <dd class="num">{{ userStore.permissions.length }} 项</dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* ---------------- 统计卡片 ---------------- */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: var(--space-4);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-5);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background-color: var(--surface);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: transform var(--duration-base) var(--ease-out-quart),
    box-shadow var(--duration-base) var(--ease-out-quart),
    border-color var(--duration-base) var(--ease-out-quart);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--brand-200);
    box-shadow: var(--shadow-md);

    .stat__arrow {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &:active {
    transform: translateY(0) scale(0.995);
  }

  /* 无跳转目标的卡片：不做可点击的视觉暗示 */
  &--static {
    cursor: default;

    &:hover {
      transform: none;
      border-color: var(--border-color);
      box-shadow: var(--shadow-xs);
    }

    &:active {
      transform: none;
    }
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__label {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__icon {
    font-size: 16px;
    color: var(--brand-400);
  }

  &__value {
    font-size: 30px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  &__skeleton {
    display: inline-block;
    width: 62px;
    height: 26px;
    vertical-align: middle;
  }

  &__error {
    color: var(--neutral-300);
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__arrow {
    font-size: 12px;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity var(--duration-base) var(--ease-out-quart),
      transform var(--duration-base) var(--ease-out-quart);
  }
}

/* ---------------- 下方两栏 ---------------- */
.panels {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  gap: var(--space-4);
}

.panel__head {
  padding: var(--space-5) var(--space-5) var(--space-3);

  h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-placeholder);
  }
}

.shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 10px;
  padding: 0 var(--space-5) var(--space-5);
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: var(--neutral-25);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-regular);
  text-align: left;
  transition: border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    border-color: var(--brand-300);
    background-color: var(--brand-50);
    color: var(--brand-700);

    .shortcut__arrow {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &__icon {
    font-size: 16px;
    color: var(--brand-500);
  }

  &__arrow {
    margin-left: auto;
    font-size: 12px;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity var(--duration-base) var(--ease-out-quart),
      transform var(--duration-base) var(--ease-out-quart);
  }
}

/* ---------------- 账号信息 ---------------- */
.account {
  padding: 0 var(--space-5) var(--space-5);
  margin: 0;

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 9px 0;
    border-bottom: 1px solid var(--neutral-100);

    &:last-child {
      border-bottom: none;
    }

    dt {
      font-size: 13px;
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }
}

@media (max-width: 1024px) {
  .panels {
    grid-template-columns: 1fr;
  }
}
</style>
