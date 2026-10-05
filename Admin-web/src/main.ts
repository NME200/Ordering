import { createApp } from 'vue';

/* 样式加载顺序不可调换：Element Plus 基础变量 → 本项目覆盖 → 基础样式 */
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-loading.css';
import 'element-plus/theme-chalk/el-notification.css';
import '@shared/styles/index.scss';

import App from './App.vue';
import router from './router';
import pinia from './store';
import { useUserStore } from './store/modules/user';
import { registerSession } from '@shared/session';
import { configureTokenKey } from '@shared/utils/auth';
import { setUnauthorizedHandler } from '@shared/utils/request';

// 三端可能在同一浏览器同时使用，令牌键名必须按端隔离
configureTokenKey('ordering_admin_token');

const app = createApp(App);

app.use(pinia);
app.use(router);

// 把本工程的 user store 注册为共享视图可用的会话实现（见 Web-shared/src/session）
registerSession(useUserStore());

/**
 * 登录失效（HTTP 401）时统一清理本地登录态并回到登录页。
 * 通过回调注册而非在请求层直接依赖 router，避免循环依赖。
 */
setUnauthorizedHandler(() => {
  const userStore = useUserStore();
  userStore.reset();

  const current = router.currentRoute.value;
  if (current.name !== 'Login') {
    void router.replace({ name: 'Login', query: { redirect: current.fullPath } });
  }
});

app.mount('#app');
