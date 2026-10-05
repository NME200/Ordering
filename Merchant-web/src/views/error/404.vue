<script setup lang="ts">
import { useRouter } from 'vue-router';
import ErrorPage from '@shared/components/ErrorPage.vue';

const router = useRouter();
</script>

<template>
  <ErrorPage
    code="404"
    title="页面不存在"
    description="你访问的地址可能已被移动或删除。请检查链接是否正确，或从左侧菜单重新进入。"
  >
    <el-button type="primary" @click="router.replace('/dashboard')">返回工作台</el-button>
    <el-button @click="router.back()">返回上一页</el-button>
  </ErrorPage>
</template>
