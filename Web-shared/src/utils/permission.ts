import type { Permission } from '../types/enums';

/**
 * 权限判定（纯函数）。
 *
 * 只用于**前端展示控制**（菜单 / 按钮是否可见）。
 * 真正的安全边界在服务端接口鉴权（见 CODEBUDDY.md 8.2），前端隐藏不等于越权防护。
 */

/** 判断已持有的权限点是否命中要求（多个要求之间为「或」关系） */
export function hasPermission(
  owned: readonly Permission[] | null | undefined,
  required?: Permission | readonly Permission[] | null,
): boolean {
  if (!required) {
    return true;
  }
  const requiredList = Array.isArray(required) ? required : [required];
  if (requiredList.length === 0) {
    return true;
  }
  if (!owned || owned.length === 0) {
    return false;
  }
  return requiredList.some((item) => owned.includes(item));
}
