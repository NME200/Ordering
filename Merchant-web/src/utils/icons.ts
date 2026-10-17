import {
  Avatar,
  Bowl,
  Coin,
  DataBoard,
  Discount,
  Document,
  Files,
  Grid,
  Headset,
  Money,
  SetUp,
  Shop,
  Star,
  Tickets,
  User,
  UserFilled,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

/**
 * 菜单图标注册表。
 *
 * 只登记侧边栏实际用到的图标（而非全局注册整个图标库），
 * 保证打包后不引入未使用的图标。
 */
const ICON_REGISTRY: Record<string, Component> = {
  DataBoard,
  Tickets,
  Shop,
  UserFilled,
  Files,
  Bowl,
  SetUp,
  Money,
  User,
  Discount,
  Avatar,
  Star,
  Document,
  Headset,
  // 「桌码管理」：一张桌一码，用网格表示台位
  Grid,
  // 「平台积分活动」只读页：分是平台发的，这里只是让商户知道账多出来的一截是谁给的
  Coin,
};

/** 按名称取图标组件，未登记时回退到 Files */
export function resolveIcon(name?: string): Component {
  if (name && ICON_REGISTRY[name]) {
    return ICON_REGISTRY[name];
  }
  return Files;
}
