import { KnifeFork, Money, Tickets } from '@element-plus/icons-vue';
import type { Component } from 'vue';

/**
 * 通道导航图标注册表。
 *
 * 只登记导航实际用到的图标（而非全局注册整个图标库），
 * 保证打包后不引入未使用的图标。新增通道时在这里补一行即可。
 */
const ICON_REGISTRY: Record<string, Component> = {
  KnifeFork,
  Tickets,
  Money,
};

/** 按名称取图标组件，未登记时回退到 Tickets */
export function resolveIcon(name?: string): Component {
  if (name && ICON_REGISTRY[name]) {
    return ICON_REGISTRY[name];
  }
  return Tickets;
}
