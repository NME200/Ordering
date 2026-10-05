<script setup lang="ts">
import { useRouter } from 'vue-router';
import ErrorPage from '@shared/components/ErrorPage.vue';

const router = useRouter();
</script>

<template>
  <ErrorPage
    code="403"
    title="这个通道不属于你"
    description="当前账号的角色没有该通道的权限点。收银台按权限点显示入口，实际拦截在服务端接口上。"
  >
    <el-button type="primary" @click="router.replace('/pos')">回到开单收银</el-button>
    <el-button @click="router.back()">返回上一页</el-button>
  </ErrorPage>
</template>
