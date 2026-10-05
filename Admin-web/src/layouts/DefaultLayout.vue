<script setup lang="ts">
import { ref, watch } from 'vue';
import AppHeader from './components/AppHeader.vue';
import AppSidebar from './components/AppSidebar.vue';

/** 侧边栏折叠状态持久化，刷新后保持用户习惯 */
const COLLAPSE_KEY = 'ordering_admin_sidebar_collapsed';

const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1');

watch(collapsed, (value) => {
  localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
});

function toggleSidebar(): void {
  collapsed.value = !collapsed.value;
}
</script>

<template>
  <div class="layout">
    <AppSidebar :collapsed="collapsed" />

    <div class="layout__main">
      <AppHeader :collapsed="collapsed" @toggle="toggleSidebar" />

      <main class="layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-app);

  &__main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-5) var(--space-6) var(--space-8);
  }
}

@media (max-width: 720px) {
  .layout__content {
    padding: var(--space-4) var(--space-4) var(--space-6);
  }
}
</style>
