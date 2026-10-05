import type { Router } from 'vue-router';
import { useUserStore } from '@/store/modules/user';

/** 登录页路由名 */
const LOGIN_ROUTE = 'Login';
/** 无权限页路由名 */
const FORBIDDEN_ROUTE = 'Forbidden';

/**
 * 注册全局前置守卫。
 *
 * 1. 未登录访问受保护路由 → 跳登录页并记住来源；
 * 2. 已登录但尚未拉取账号档案 → 先拉取（含权限点）；
 * 3. 账号无该路由所需权限 → 跳 403。
 */
export function setupRouterGuard(router: Router): void {
  router.beforeEach(async (to) => {
    const userStore = useUserStore();
    const requiresAuth = to.meta.requiresAuth !== false;

    if (!requiresAuth) {
      if (to.name === LOGIN_ROUTE && userStore.isLoggedIn) {
        return { path: '/' };
      }
      return true;
    }

    if (!userStore.isLoggedIn) {
      return { name: LOGIN_ROUTE, query: { redirect: to.fullPath } };
    }

    if (!userStore.profile) {
      try {
        await userStore.loadProfile();
      } catch {
        userStore.reset();
        return { name: LOGIN_ROUTE, query: { redirect: to.fullPath } };
      }
    }

    if (!userStore.hasPermission(to.meta.permission)) {
      return { name: FORBIDDEN_ROUTE };
    }

    return true;
  });

  router.afterEach((to) => {
    const appTitle = import.meta.env.VITE_APP_TITLE || 'Ordering 商户后台';
    document.title = to.meta.title ? `${to.meta.title} · ${appTitle}` : appTitle;
  });
}
