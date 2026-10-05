<script setup lang="ts">
import { useRouter } from 'vue-router';
import ErrorPage from '@shared/components/ErrorPage.vue';

const router = useRouter();
</script>

<template>
  <ErrorPage
    code="404"
    title="没有这个页面"
    description="地址可能输错了，或者该功能属于商户后台 / 平台管理端，不在收银台里。"
  >
    <el-button type="primary" @click="router.replace('/pos')">回到开单收银</el-button>
    <el-button @click="router.back()">返回上一页</el-button>
  </ErrorPage>
</template>
