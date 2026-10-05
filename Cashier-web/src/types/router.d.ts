import type { Permission } from '@shared/types/enums';

/**
 * 路由 meta 类型扩展。
 *
 * 所有路由统一通过 meta 声明标题、图标、所需权限等，
 * 顶部通道导航与路由守卫都从这里读取，避免两处维护。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 菜单与浏览器标题 */
    title?: string;
    /** 面包屑 / 导航副标题用的父级名称 */
    parentTitle?: string;
    /** 菜单图标名（对应 @element-plus/icons-vue 的组件名） */
    icon?: string;
    /** 通道导航上显示的简短名称（收银台空间有限，与 title 分开维护） */
    navLabel?: string;
    /** 访问所需权限点；多个之间为「或」关系 */
    permission?: Permission | Permission[];
    /** 是否需要登录，默认 true；登录页显式设为 false */
    requiresAuth?: boolean;
    /** 是否在通道导航中隐藏 */
    hidden?: boolean;
    /** 非菜单页面指定导航高亮的路径 */
    activeMenu?: string;
  }
}
