<script setup lang="ts">
import { onMounted } from 'vue';
import TerminalHeader from './components/TerminalHeader.vue';
import { useTerminalStore } from '@/store/modules/terminal';

const terminalStore = useTerminalStore();

onMounted(() => {
  void terminalStore.load();
});
</script>

<template>
  <div class="cashier">
    <TerminalHeader />

    <!--
      收银台的滚动由**各通道自己**负责（POS 是双栏各自滚动，订单是列表滚动），
      因此这里不给内容区加 padding，也不让它整体滚动 —— 触屏上整页滚动
      会让「收款」按钮跟着滑出屏幕，是不可接受的。
    -->
    <main class="cashier__body">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped lang="scss">
.cashier {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-app);

  &__body {
    flex: 1;
    min-height: 0;
  }
}
</style>
