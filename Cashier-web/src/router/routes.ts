import type { RouteRecordRaw } from 'vue-router';
import { Permission } from '@shared/types/enums';

/**
 * 收银台的通道导航。
 *
 * 收银台不是后台：**入口越少越快**。这里只放四张通道，
 * 门店 / 员工 / 菜单的维护属于 Merchant-web，收银台一律不提供编辑入口
 * （收银员本来也只有菜单只读权限）。
 *
 * 顺序按使用频率：开单收银是站着操作的，永远排第一；叫号台守在门口用。
 */
export const menuRoutes: RouteRecordRaw[] = [
  {
    path: 'pos',
    name: 'Pos',
    component: () => import('@/views/pos/index.vue'),
    meta: {
      title: '开单收银',
      navLabel: '开单收银',
      icon: 'KnifeFork',
      permission: Permission.ORDER_CREATE,
    },
  },
  {
    path: 'orders',
    name: 'OrderBoard',
    component: () => import('@/views/order/index.vue'),
    meta: {
      title: '订单流转',
      navLabel: '订单',
      icon: 'Tickets',
      permission: Permission.ORDER_READ,
    },
  },
  {
    path: 'payments',
    name: 'PaymentList',
    component: () => import('@/views/payment/index.vue'),
    meta: {
      title: '收款记录',
      navLabel: '收款',
      icon: 'Money',
      permission: Permission.PAYMENT_READ,
    },
  },
  {
    path: 'queue',
    name: 'QueueDesk',
    component: () => import('@/views/queue/queue.vue'),
    meta: {
      title: '叫号台',
      navLabel: '叫号',
      icon: 'Bell',
      permission: Permission.QUEUE_READ,
    },
  },
];

/** 导航项 */
export interface NavItem {
  /** 绝对路径 */
  path: string;
  title: string;
  navLabel: string;
  icon: string;
  permission?: Permission;
}

/** 由路由表派生的导航项 */
export const navItems: NavItem[] = menuRoutes
  .filter((route) => typeof route.path === 'string' && route.meta?.hidden !== true)
  .map((route) => {
    const meta = route.meta;
    const path = `/${route.path as string}`;
    return {
      path,
      title: meta?.title ?? '',
      navLabel: meta?.navLabel ?? meta?.title ?? '',
      icon: meta?.icon ?? 'Menu',
      permission: meta?.permission as Permission | undefined,
    };
  })
  .filter((item) => item.title !== '');

/** 不在导航中展示的页面 */
const hiddenRoutes: RouteRecordRaw[] = [
  {
    path: 'profile',
    name: 'Profile',
    component: () => import('@/views/profile/index.vue'),
    meta: { title: '我的账号', icon: 'User', hidden: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无访问权限', hidden: true },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在', hidden: true },
  },
];

/** 完整路由表 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', requiresAuth: false, hidden: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/CashierLayout.vue'),
    redirect: '/pos',
    children: [...menuRoutes, ...hiddenRoutes],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
];
