import type { Router } from 'vue-router';
import { useUserStore } from '@/store/modules/user';

/** 登录页路由名 */
const LOGIN_ROUTE = 'Login';
/** 无权限页路由名 */
const FORBIDDEN_ROUTE = 'Forbidden';

/**
 * 注册全局前置守卫（见 CODEBUDDY.md 6.4）。
 *
 * 处理四件事：
 * 1. 未登录访问受保护路由 → 跳登录页并记住来源；
 * 2. 已登录但尚未拉取账号档案 → 先拉取（含权限点）；
 * 3. 路由声明了 `meta.roles` 但当前角色不在其中 → 跳 403；
 * 4. 账号无该路由所需权限点 → 跳 403。
 *
 * 角色与权限点是两道独立的闸：权限点能被授权下放给运营专员，
 * 角色声明（如「平台账户」）不能 —— 否则被授权的人就能给自己加授权。
 */
export function setupRouterGuard(router: Router): void {
  router.beforeEach(async (to) => {
    const userStore = useUserStore();
    const requiresAuth = to.meta.requiresAuth !== false;

    if (!requiresAuth) {
      // 已登录账号访问登录页时，直接送回工作台
      if (to.name === LOGIN_ROUTE && userStore.isLoggedIn) {
        return { path: '/' };
      }
      return true;
    }

    if (!userStore.isLoggedIn) {
      return { name: LOGIN_ROUTE, query: { redirect: to.fullPath } };
    }

    // 刷新页面后 profile 为空，此处补拉一次；失败说明令牌已失效
    if (!userStore.profile) {
      try {
        await userStore.loadProfile();
      } catch {
        userStore.reset();
        return { name: LOGIN_ROUTE, query: { redirect: to.fullPath } };
      }
    }

    if (!userStore.hasRole(to.meta.roles) || !userStore.hasPermission(to.meta.permission)) {
      return { name: FORBIDDEN_ROUTE };
    }

    return true;
  });

  router.afterEach((to) => {
    const appTitle = import.meta.env.VITE_APP_TITLE || 'Ordering 管理后台';
    document.title = to.meta.title ? `${to.meta.title} · ${appTitle}` : appTitle;
  });
}
