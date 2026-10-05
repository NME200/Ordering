import type { Permission } from '@shared/types/enums';

/**
 * 路由 meta 类型扩展。
 *
 * 所有路由统一通过 meta 声明标题、图标、所需权限等，
 * 侧边栏与路由守卫都从这里读取，避免两处维护。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 菜单与浏览器标题 */
    title?: string;
    /** 面包屑中的父级名称（用于详情页等非菜单页面） */
    parentTitle?: string;
    /** 菜单图标名（对应 @element-plus/icons-vue 的组件名） */
    icon?: string;
    /** 访问所需权限点；多个之间为「或」关系 */
    permission?: Permission | Permission[];
    /** 是否需要登录，默认 true；登录页显式设为 false */
    requiresAuth?: boolean;
    /** 是否在侧边栏中隐藏 */
    hidden?: boolean;
    /** 非菜单页面指定侧边栏高亮的菜单路径 */
    activeMenu?: string;
  }
}
