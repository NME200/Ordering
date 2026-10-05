import type { RouteRecordRaw } from 'vue-router';
import { AccountKind, Permission, Role } from '@shared/types/enums';

/**
 * 平台管理端的侧边栏菜单路由。
 *
 * 只放**平台职责**：商户治理 + 账户治理。
 * 门店、菜单（分类 / 菜品 / 规格组）属于商户的经营资产，不进侧边栏，
 * 而是在「商户详情」页内以只读标签页的形式提供排查视图 —— 见 `hiddenRoutes`。
 *
 * 账户治理拆成两个页签，因为管的是两拨人：
 * - 「平台账户」= 平台自己的团队（管理员 + 运营专员），只有平台管理员进得来，
 *   授权动作也 exclusive 属于它，所以用 `meta.roles` 而不是权限点把关；
 * - 「商家账户」= 各商户的管理员账号，可授权给运营专员查看与封禁。
 *   商家下面的门店管理员与收银员不在这里铺开，需要时从商户详情下钻。
 *
 * 平台端对商户业务数据只有 read 权限（见后端 permission-map），
 * 因此这些内嵌视图是只读的；例外是门店 —— 平台可开通 / 停用 / 删除，
 * 所以「门店」页签有新增与删除入口，但改不了门店资料（平台没有 `store:update`，不会出现「编辑」）。
 */
export const menuRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: '工作台', icon: 'DataBoard' },
  },
  {
    path: 'merchants',
    name: 'MerchantList',
    component: () => import('@/views/merchant/index.vue'),
    meta: { title: '商户管理', icon: 'OfficeBuilding', permission: Permission.MERCHANT_READ },
  },
  {
    path: 'accounts/platform',
    name: 'PlatformAccounts',
    component: () => import('@/views/account/platform.vue'),
    meta: {
      title: '平台账户',
      icon: 'Avatar',
      permission: Permission.USER_READ,
      roles: [Role.PLATFORM_ADMIN],
    },
  },
  {
    path: 'accounts/merchants',
    name: 'MerchantAccounts',
    component: () => import('@/views/account/merchant.vue'),
    // 该页签固定只看各商户的管理员账号；商户详情里的下钻走另一套 props
    props: { accountKind: AccountKind.MERCHANT_ADMIN },
    meta: { title: '商家账户', icon: 'UserFilled', permission: Permission.USER_READ },
  },
  {
    path: 'app-config',
    name: 'AppConfig',
    component: () => import('@/views/app-config/index.vue'),
    meta: {
      title: '小程序布局',
      icon: 'Brush',
      permission: Permission.APP_CONFIG_READ,
    },
  },
  {
    path: 'payment-configs',
    name: 'PaymentConfig',
    component: () => import('@/views/payment-config/index.vue'),
    meta: {
      title: '支付配置',
      icon: 'CreditCard',
      permission: Permission.PAYMENT_CONFIG_READ,
    },
  },
];

/**
 * 不在侧边栏中展示的路由。
 *
 * 商户详情承载了「跨租户只读排查」：进入某个商户后查看它的门店与菜单，
 * 以及该商户全部员工账号 —— 这是平台为商家止血（改密 / 封禁）的下钻入口。
 */
const hiddenRoutes: RouteRecordRaw[] = [
  {
    path: 'merchants/:id',
    name: 'MerchantDetail',
    component: () => import('@/views/merchant-detail/index.vue'),
    meta: {
      title: '商户详情',
      parentTitle: '商户管理',
      // 侧边栏高亮父级菜单
      activeMenu: '/merchants',
      permission: Permission.MERCHANT_READ,
      hidden: true,
    },
  },
  {
    path: 'profile',
    name: 'Profile',
    component: () => import('@/views/profile/index.vue'),
    meta: { title: '个人中心', icon: 'User', hidden: true },
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

/** 侧边栏菜单项 */
export interface MenuItem {
  /** 绝对路径 */
  path: string;
  title: string;
  icon: string;
  permission?: Permission;
  roles?: Role[];
}

/** 由路由表派生的菜单项（只取未隐藏且声明了标题的路由） */
export const menuItems: MenuItem[] = menuRoutes
  .filter((route) => typeof route.path === 'string' && route.meta?.hidden !== true)
  .map((route) => {
    const meta = route.meta;
    return {
      path: `/${route.path as string}`,
      title: meta?.title ?? '',
      icon: meta?.icon ?? 'Menu',
      permission: meta?.permission as Permission | undefined,
      roles: meta?.roles,
    };
  })
  .filter((item) => item.title !== '');

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
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: '/dashboard',
    children: [...menuRoutes, ...hiddenRoutes],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
];
