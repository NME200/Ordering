/**
 * 需要前端分支处理的后端错误码。
 *
 * 取值镜像 `ordering-serve/src/shared/enums/error-code.enum.ts`，
 * 只登记收银台真正要据此改变行为的那些 —— 其余错误一律由请求层统一提示。
 */

/** 80004 ORDER_DISH_UNAVAILABLE：菜品不存在或已下架 */
export const ORDER_DISH_UNAVAILABLE = 80004;
