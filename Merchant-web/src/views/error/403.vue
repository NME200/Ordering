<script setup lang="ts">
import { useRouter } from 'vue-router';
import ErrorPage from '@shared/components/ErrorPage.vue';

const router = useRouter();
</script>

<template>
  <ErrorPage
    code="403"
    title="没有访问权限"
    description="当前账号的角色不包含该模块的权限点。如需访问，请联系本商户的管理员调整你的角色。"
  >
    <el-button type="primary" @click="router.replace('/dashboard')">返回工作台</el-button>
    <el-button @click="router.back()">返回上一页</el-button>
  </ErrorPage>
</template>
