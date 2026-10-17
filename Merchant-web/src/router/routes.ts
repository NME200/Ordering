import type { RouteRecordRaw } from 'vue-router';
import { Permission } from '@shared/types/enums';

/**
 * 商户后台的侧边栏菜单路由。
 *
 * 顺序按「经营 → 组织 → 菜单」组织：
 * 订单与支付是每天都要盯的，排在前面；门店与员工是组织配置；
 * 菜品三件套（分类 / 菜品 / 规格组）是经营配置。
 *
 * 各角色看到的菜单由权限点过滤（见 CODEBUDDY.md 8.2）：
 * - 商户管理员：全部
 * - 门店管理员：除「员工账号」外都有（写权限仅限菜品上下架与订单处理）
 */
export const menuRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/index.vue'),
    meta: { title: '工作台', icon: 'DataBoard' },
  },
  {
    path: 'orders',
    name: 'OrderList',
    component: () => import('@/views/order/index.vue'),
    meta: { title: '订单管理', icon: 'Tickets', permission: Permission.ORDER_READ },
  },
  {
    path: 'payments',
    name: 'PaymentList',
    component: () => import('@/views/payment/index.vue'),
    meta: { title: '支付流水', icon: 'Money', permission: Permission.PAYMENT_READ },
  },
  {
    path: 'stores',
    name: 'StoreList',
    component: () => import('@shared/views/store/index.vue'),
    meta: { title: '门店管理', icon: 'Shop', permission: Permission.STORE_READ },
  },
  {
    path: 'table-qrcodes',
    name: 'TableQrcodeList',
    component: () => import('@shared/views/table-qrcode/index.vue'),
    meta: { title: '桌码管理', icon: 'Grid', permission: Permission.STORE_READ },
  },
  {
    path: 'accounts',
    name: 'AccountList',
    component: () => import('@shared/views/user/index.vue'),
    meta: { title: '员工账号', icon: 'UserFilled', permission: Permission.USER_READ },
  },
  {
    path: 'dish-categories',
    name: 'DishCategoryList',
    component: () => import('@shared/views/dish-category/index.vue'),
    meta: { title: '菜品分类', icon: 'Files', permission: Permission.CATEGORY_READ },
  },
  {
    path: 'dishes',
    name: 'DishList',
    component: () => import('@shared/views/dish/index.vue'),
    meta: { title: '菜品管理', icon: 'Bowl', permission: Permission.DISH_READ },
  },
  {
    path: 'spec-groups',
    name: 'SpecGroupList',
    component: () => import('@shared/views/spec-group/index.vue'),
    meta: { title: '规格组', icon: 'SetUp', permission: Permission.SPEC_READ },
  },
  /* 顾客与售后：都是「顾客提交之后商户要接住」的闭环，排在经营配置之后 */
  {
    path: 'coupons',
    name: 'CouponList',
    component: () => import('@/views/coupon/index.vue'),
    meta: { title: '优惠券', icon: 'Discount', permission: Permission.COUPON_READ },
  },
  {
    path: 'point-activities',
    name: 'PointActivityList',
    component: () => import('@/views/point-activity/index.vue'),
    meta: { title: '积分活动', icon: 'Coin', permission: Permission.POINT_ACTIVITY_READ },
  },
  // 顾客名册不在商家端：账号是全平台账号，封禁与解封归平台管。
  // 商家看得到的是自己这一侧的履约数据 —— 评价、开票、客服、券。
  {
    path: 'reviews',
    name: 'ReviewList',
    component: () => import('@/views/review/index.vue'),
    meta: { title: '顾客评价', icon: 'Star', permission: Permission.REVIEW_READ },
  },
  {
    path: 'invoices',
    name: 'InvoiceList',
    component: () => import('@/views/invoice/index.vue'),
    meta: { title: '开票申请', icon: 'Document', permission: Permission.INVOICE_READ },
  },
  {
    path: 'service',
    name: 'ServiceDesk',
    component: () => import('@/views/service/index.vue'),
    meta: { title: '客服工作台', icon: 'Headset', permission: Permission.SERVICE_READ },
  },
];

/** 侧边栏菜单项 */
export interface MenuItem {
  /** 绝对路径 */
  path: string;
  title: string;
  icon: string;
  permission?: Permission;
}

/** 由路由表派生的菜单项 */
export const menuItems: MenuItem[] = menuRoutes
  .filter((route) => typeof route.path === 'string' && route.meta?.hidden !== true)
  .map((route) => {
    const meta = route.meta;
    return {
      path: `/${route.path as string}`,
      title: meta?.title ?? '',
      icon: meta?.icon ?? 'Menu',
      permission: meta?.permission as Permission | undefined,
    };
  })
  .filter((item) => item.title !== '');

/** 不在侧边栏中展示的路由 */
const hiddenRoutes: RouteRecordRaw[] = [
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

/** 完整路由表 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', requiresAuth: false, hidden: true },
  },
  {
    path: '/screen',
    name: 'DataScreen',
    component: () => import('@/views/screen/index.vue'),
    // 挂在布局之外：大屏要的是整块 16:9，侧边栏和面包屑在上面只会占掉一截画面
    meta: { title: '数据大屏', requiresAuth: true, hidden: true },
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
