/**
 * 权限点（见 CODEBUDDY.md 5.4 / 8.2）。
 *
 * 命名规则：`<资源>:<动作>`，前后端共用同一套标识。
 * 菜单权限、按钮权限与接口权限都基于这里的标识做校验。
 */
export enum Permission {
  /** 商户：新增 */
  MERCHANT_CREATE = 'merchant:create',
  /** 商户：查看 */
  MERCHANT_READ = 'merchant:read',
  /** 商户：编辑 */
  MERCHANT_UPDATE = 'merchant:update',
  /** 商户：删除 */
  MERCHANT_DELETE = 'merchant:delete',

  /** 门店：新增 */
  STORE_CREATE = 'store:create',
  /** 门店：查看 */
  STORE_READ = 'store:read',
  /** 门店：编辑（仅资料：名称 / 编码 / 地址 / 电话 / 营业状态） */
  STORE_UPDATE = 'store:update',
  /** 门店：禁用与恢复 */
  STORE_DISABLE = 'store:disable',
  /** 门店：删除 */
  STORE_DELETE = 'store:delete',

  /** 员工账号：新增 */
  USER_CREATE = 'user:create',
  /** 员工账号：查看 */
  USER_READ = 'user:read',
  /** 员工账号：编辑 */
  USER_UPDATE = 'user:update',
  /** 员工账号：删除 */
  USER_DELETE = 'user:delete',

  /** 菜品分类：新增 */
  CATEGORY_CREATE = 'category:create',
  /** 菜品分类：查看 */
  CATEGORY_READ = 'category:read',
  /** 菜品分类：编辑 */
  CATEGORY_UPDATE = 'category:update',
  /** 菜品分类：删除 */
  CATEGORY_DELETE = 'category:delete',

  /** 菜品：新增 */
  DISH_CREATE = 'dish:create',
  /** 菜品：查看 */
  DISH_READ = 'dish:read',
  /** 菜品：编辑（含上下架） */
  DISH_UPDATE = 'dish:update',
  /** 菜品：删除 */
  DISH_DELETE = 'dish:delete',

  /** 规格组：新增 */
  SPEC_CREATE = 'spec:create',
  /** 规格组：查看 */
  SPEC_READ = 'spec:read',
  /** 规格组：编辑 */
  SPEC_UPDATE = 'spec:update',
  /** 规格组：删除 */
  SPEC_DELETE = 'spec:delete',

  /** 订单：新增（收银台 / 商户后台代客开单） */
  ORDER_CREATE = 'order:create',
  /** 订单：查看 */
  ORDER_READ = 'order:read',
  /** 订单：操作（接单 / 出餐 / 完成） */
  ORDER_UPDATE = 'order:update',
  /** 订单：取消 / 拒单 */
  ORDER_CANCEL = 'order:cancel',

  /** 支付流水：查看 */
  PAYMENT_READ = 'payment:read',
  /** 支付流水：退款 */
  PAYMENT_REFUND = 'payment:refund',

  /** 支付配置（渠道凭据）：查看 */
  PAYMENT_CONFIG_READ = 'payment-config:read',
  /** 支付配置（渠道凭据）：修改 */
  PAYMENT_CONFIG_UPDATE = 'payment-config:update',

  /** 小程序布局配置：查看 */
  APP_CONFIG_READ = 'app-config:read',
  /** 小程序布局配置：修改与发布 */
  APP_CONFIG_UPDATE = 'app-config:update',
}
