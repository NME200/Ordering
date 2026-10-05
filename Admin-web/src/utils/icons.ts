import {
  Avatar,
  Brush,
  CreditCard,
  DataBoard,
  Files,
  OfficeBuilding,
  User,
  UserFilled,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

/**
 * 菜单图标注册表。
 *
 * 只登记侧边栏实际用到的图标（而非全局注册整个图标库），
 * 保证打包后不引入未使用的图标。
 *
 * 新增菜单项时，在这里补一行即可。
 */
const ICON_REGISTRY: Record<string, Component> = {
  DataBoard,
  OfficeBuilding,
  Avatar,
  UserFilled,
  User,
  CreditCard,
  Brush,
};

/** 按名称取图标组件，未登记时回退到 Files */
export function resolveIcon(name?: string): Component {
  if (name && ICON_REGISTRY[name]) {
    return ICON_REGISTRY[name];
  }
  return Files;
}
