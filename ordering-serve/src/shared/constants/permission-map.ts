import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';

/**
 * 平台管理端权限：**商户治理 + 账号治理 + 商户业务数据只读**。
 *
 * 平台管理员是「治理方」而不是「经营者」，因此：
 * - 拥有 `merchant:*`（商户生命周期）与 `user:*`（账号治理）；
 *   `user:*` 现在的含义已收窄为「平台账户的完整增删改与授权」+「商家账户的查看、
 *   重置密码与封禁」，**不再包含为商家创建员工账号** —— 商家员工由商家自行开通；
 * - 拥有 `store:create` / `store:disable` / `store:delete`：挂店、停店、删店属**租户配置**；
 *   但门店资料（名称 / 地址 / 营业状态）仍归商家，平台**没有** `store:update`；
 * - 对菜品 / 规格 / 订单 / 支付**只有 read**，用于在「商户详情」里排查问题；
 * - **不拥有任何经营类的写权限**（改菜单、上下架、接单、退款等）。
 *
 * ⚠️ 这里刻意不再使用 `Object.values(Permission)`：那种写法会让平台端顺带拿到
 * 全部经营权限，导致平台管理端与商户后台职责重叠。
 */
const PLATFORM_ADMIN_PERMISSIONS: Permission[] = [
  // 商户（租户）生命周期 —— 平台核心职责
  Permission.MERCHANT_CREATE,
  Permission.MERCHANT_READ,
  Permission.MERCHANT_UPDATE,
  Permission.MERCHANT_DELETE,

  // 账号治理：查看 / 封禁 / 重置密码商家账号，并完整维护平台自己的账号
  Permission.USER_CREATE,
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.USER_DELETE,

  // 门店的开通 / 停用 / 删除归平台；门店资料与营业状态归商家
  Permission.STORE_CREATE,
  Permission.STORE_DISABLE,
  Permission.STORE_DELETE,

  // 以下为「商户详情」内的只读排查视图，平台不参与经营维护
  Permission.STORE_READ,
  Permission.CATEGORY_READ,
  Permission.DISH_READ,
  Permission.SPEC_READ,
  Permission.ORDER_READ,
  Permission.PAYMENT_READ,

  /**
   * 支付配置（渠道商户号 / 私钥 / 证书）。
   *
   * 只有平台能配：这些是**资金级凭据**，泄露等于交出收款主体身份。
   * 商户管理员 / 门店管理员 / 收银员一律不给，也不经由商户端界面暴露。
   */
  Permission.PAYMENT_CONFIG_READ,
  Permission.PAYMENT_CONFIG_UPDATE,

  /**
   * 小程序布局（首页组件与主题皮肤）。
   *
   * 与支付配置同构：能改它等于能改全体顾客看到的品牌呈现，
   * 只归平台管理员，**不进可授权白名单**。
   */
  Permission.APP_CONFIG_READ,
  Permission.APP_CONFIG_UPDATE,

  /**
   * 小程序配置（AppID / AppSecret / 扫码规则 / 桌号二维码）。
   *
   * AppSecret 能换到调用微信接口的 access_token，等于小程序的身份凭据，
   * 与支付配置同级：只归平台管理员，**不进可授权白名单**。
   */
  Permission.MINIAPP_READ,
  Permission.MINIAPP_UPDATE,

  /**
   * 活动弹窗（首页 / 进店 / 支付成功的运营位）。
   *
   * 与布局配置同一判断：它直接对全体顾客弹内容、还能带跳转，
   * 只归平台管理员，**不进可授权白名单**。
   */
  Permission.POPUP_READ,
  Permission.POPUP_UPDATE,

  /**
   * 顾客账号：平台**独有**的治理对象；营销只有一部分能改。
   *
   * 一个顾客账号在平台下所有商户都能下单，会员资产才按商户分档。
   * 所以「封禁 / 解封」只能由平台做 —— 让商户封一个账号，等于让一家店
   * 决定这个人在整个平台还能不能消费，那是越权。
   * 商户例外只有平台券（merchantId 为空、全场通用），改不了任何商户自己的券。
   */
  Permission.CUSTOMER_READ,
  Permission.CUSTOMER_UPDATE,
  Permission.COUPON_READ,
  Permission.COUPON_UPDATE,

  /**
   * 积分活动（平台补贴发分）。
   *
   * 与活动弹窗、装修配置同一判断：它决定全体顾客拿多少分，
   * 只归平台管理员，**不进可授权白名单**。商户侧的读权限走
   * `GET /point-activities/effective`，那里按 Token 的商户现算，读不到别家的配置。
   */
  Permission.POINT_ACTIVITY_READ,
  Permission.POINT_ACTIVITY_UPDATE,

  Permission.REVIEW_READ,
  Permission.INVOICE_READ,
  Permission.SERVICE_READ,
  Permission.QUEUE_READ,
];

/**
 * 商户后台权限：门店 / 员工 / 菜单 / 订单 / 支付的完整经营权限，不含商户本身。
 *
 * 门店可由商户自行开通与删除（`store:create` / `store:delete`），资料与营业状态归商户
 * （`store:update`）；`store:disable` 也有，但**平台停用的店商户解不开**（见 8.2.2 与
 * `StoreService.changeStatus`）。没有任何 `merchant:*`：商户不能碰租户边界本身。
 */
const MERCHANT_ADMIN_PERMISSIONS: Permission[] = [
  Permission.STORE_CREATE,
  Permission.STORE_READ,
  Permission.STORE_UPDATE,
  Permission.STORE_DISABLE,
  Permission.STORE_DELETE,
  Permission.USER_CREATE,
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.USER_DELETE,
  Permission.CATEGORY_CREATE,
  Permission.CATEGORY_READ,
  Permission.CATEGORY_UPDATE,
  Permission.CATEGORY_DELETE,
  Permission.DISH_CREATE,
  Permission.DISH_READ,
  Permission.DISH_UPDATE,
  Permission.DISH_DELETE,
  Permission.SPEC_CREATE,
  Permission.SPEC_READ,
  Permission.SPEC_UPDATE,
  Permission.SPEC_DELETE,
  Permission.ORDER_CREATE,
  Permission.ORDER_READ,
  Permission.ORDER_UPDATE,
  Permission.ORDER_CANCEL,
  Permission.PAYMENT_READ,
  Permission.PAYMENT_REFUND,

  // 营销与售后：商户是这些数据的归属方，读写都归它。
  // 刻意**不含 customer:***：顾客账号是全平台账号，不是某个商户的资产。
  // 商户拥有的是「这个人在本店那一套会员档案」（积分 / 余额 / 券），
  // 那属于 review / invoice / service 这些履约视图，不等于能封别人的账号。
  Permission.COUPON_READ,
  Permission.COUPON_UPDATE,
  // 平台积分活动对**只读**：规则与开关都在平台手里，商户要看得见的只是
  // 「这家店这一段分数是平台补贴的」，否则对账时会被当成自己多发了分。
  Permission.POINT_ACTIVITY_READ,
  Permission.REVIEW_READ,
  Permission.REVIEW_UPDATE,
  Permission.INVOICE_READ,
  Permission.INVOICE_UPDATE,
  Permission.SERVICE_READ,
  Permission.SERVICE_UPDATE,
  Permission.QUEUE_READ,
  Permission.QUEUE_CREATE,
  Permission.QUEUE_UPDATE,
];

/**
 * 门店管理员：管本店员工、可上下架菜品、处理本店订单（含代客开单）与退款。
 *
 * 营销与顾客资产**只读**：券是商户级承诺，门店改一张券等于替整个品牌做主；
 * 但评价回复、开票受理、客服回复、叫号都是本店履约范围内必须当场做完的动作。
 */
const STORE_MANAGER_PERMISSIONS: Permission[] = [
  Permission.STORE_READ,
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.CATEGORY_READ,
  Permission.DISH_READ,
  Permission.DISH_UPDATE,
  Permission.SPEC_READ,
  Permission.ORDER_CREATE,
  Permission.ORDER_READ,
  Permission.ORDER_UPDATE,
  Permission.ORDER_CANCEL,
  Permission.PAYMENT_READ,
  Permission.PAYMENT_REFUND,
  // 顾客名册不在门店管理员的视野里：封禁与会员归属都不是门店一级的权限
  Permission.COUPON_READ,
  Permission.POINT_ACTIVITY_READ,
  Permission.REVIEW_READ,
  Permission.REVIEW_UPDATE,
  Permission.INVOICE_READ,
  Permission.INVOICE_UPDATE,
  Permission.SERVICE_READ,
  Permission.SERVICE_UPDATE,
  Permission.QUEUE_READ,
  Permission.QUEUE_CREATE,
  Permission.QUEUE_UPDATE,
];

/**
 * 收银员：收银台专用角色。
 *
 * 职责是「收款 + 线下代客开单 + 订单流转」：
 * - 可 `order:create` 代客开单（租户与门店取自 Token，不能跨店）；
 * - 可 `order:update` 接单 / 出餐；
 * - **不可** `order:cancel` 与 `payment:refund` —— 取消与退款涉及资金，属敏感操作；
 * - 菜单只读（收银台需要展示菜单，但不能改价改菜）。
 */
const CASHIER_PERMISSIONS: Permission[] = [
  Permission.STORE_READ,
  Permission.CATEGORY_READ,
  Permission.DISH_READ,
  Permission.SPEC_READ,
  Permission.ORDER_CREATE,
  Permission.ORDER_READ,
  Permission.ORDER_UPDATE,
  Permission.PAYMENT_READ,
  // 叫号是前台的活：收银台要替到店顾客取号并推进队列
  Permission.QUEUE_READ,
  Permission.QUEUE_CREATE,
  Permission.QUEUE_UPDATE,
];

/**
 * 角色 → 权限点映射表。
 *
 * 这里是**角色默认权限**：账号没有显式授权清单（`users.permissions` 为 NULL）时按本表取值。
 * 平台运营专员刻意留空 —— 它的权限全部来自平台管理员的逐项授权，
 * 因此新增 / 调整运营岗不需要改这张表。
 *
 * 注意：这里只描述「能力」。账号能从哪个端登录由 `portal-map.ts` 决定，两者正交。
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.PLATFORM_ADMIN]: PLATFORM_ADMIN_PERMISSIONS,
  /** 空默认权限：完全由平台管理员在该账号上授权 */
  [Role.PLATFORM_OPERATOR]: [],
  [Role.MERCHANT_ADMIN]: MERCHANT_ADMIN_PERMISSIONS,
  [Role.STORE_MANAGER]: STORE_MANAGER_PERMISSIONS,
  [Role.CASHIER]: CASHIER_PERMISSIONS,
};

/** 获取某角色拥有的全部权限点 */
export function getPermissionsByRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * 可下放给平台运营专员的权限点白名单。
 *
 * 授权不是「把 30 个权限点摊开随便勾」—— 有几类必须留在平台管理员手里：
 * - `payment-config:*`：渠道商户号 / 私钥 / 证书属资金级凭据，控制器上还有
 *   `@Roles(PLATFORM_ADMIN)` 硬锁，放进展位只会让勾了却 403 的错觉；
 * - `miniapp:*`：AppSecret 能换到调用微信接口的 access_token，同上不下放；
 * - `user:create` / `user:delete`：平台账户的新增与删除只归平台管理员；
 *   商家员工本就由商家自行开通与删除，平台端没有这两个动作。
 * - `store:delete`：删店不可逆且直接抹掉商户的履约主体，留在平台管理员手里；
 *   日常「停店」用可逆的 `store:disable`，不必下放删除。
 * - `app-config:*` / `popup:*` / `point-activity:*`：界面装修、对全体顾客弹窗、
 *   给全体顾客发多少分，都是平台级承诺，控制器上另有 `@Roles` 硬锁。
 *
 * 因此白名单 = 商户生命周期 + 账号治理的只读与封禁 + 业务数据只读。
 * **平台端依旧拿不到任何经营类写权限**，授权只是把治理动作切薄一层，
 * 不是把商户后台的能力搬到平台端。
 */
export const GRANTABLE_PERMISSIONS: Permission[] = [
  Permission.MERCHANT_CREATE,
  Permission.MERCHANT_READ,
  Permission.MERCHANT_UPDATE,
  Permission.MERCHANT_DELETE,
  Permission.USER_READ,
  Permission.USER_UPDATE,
  Permission.STORE_CREATE,
  // 停用 / 恢复门店与封禁账号同类，是止血动作，可以切给被授权的运营
  Permission.STORE_DISABLE,
  Permission.STORE_READ,
  Permission.CATEGORY_READ,
  Permission.DISH_READ,
  Permission.SPEC_READ,
  Permission.ORDER_READ,
  Permission.PAYMENT_READ,
  // 顾客与售后的只读视图可以切给被授权的运营；写动作（受理开票、回复客服、改券）不行
  Permission.CUSTOMER_READ,
  // 封禁顾客与封禁商家账号同类：都是账号治理的止血动作，可以切给被授权的运营
  Permission.CUSTOMER_UPDATE,
  Permission.COUPON_READ,
  Permission.REVIEW_READ,
  Permission.INVOICE_READ,
  Permission.SERVICE_READ,
  Permission.QUEUE_READ,
];

/** 判断某权限点能否被授权给运营专员 */
export function isGrantablePermission(permission: Permission): boolean {
  return GRANTABLE_PERMISSIONS.includes(permission);
}

/**
 * 账号的**有效权限点** —— 鉴权与 profile 下发的唯一取值口径。
 *
 * `granted` 为 NULL 表示沿用角色默认；为数组（含空数组）表示显式授权清单，
 * **完全替代**角色默认而不是与之求并集 —— 「授权」的语义是重新划定能力边界，
 * 求并集会让「收回权限」这件事无法表达。
 */
export function getEffectivePermissions(
  role: Role,
  granted?: Permission[] | null,
): Permission[] {
  return granted ?? getPermissionsByRole(role);
}
