/**
 * 全局业务错误码。
 *
 * 约定：0 表示成功，其余按业务域分段，禁止在业务代码中散落魔法数字。
 * 分段规则：
 * - 1xxxx 通用 / 框架层
 * - 2xxxx 认证与账号
 * - 3xxxx 商户（租户）
 * - 4xxxx 门店
 */
export enum ErrorCode {
  /** 成功 */
  SUCCESS = 0,

  // ---------- 1xxxx 通用 ----------
  /** 未知错误 */
  UNKNOWN = 10000,
  /** 请求参数不合法 */
  PARAM_INVALID = 10001,
  /** 未登录或登录已失效 */
  UNAUTHORIZED = 10002,
  /** 无权限访问该资源 */
  FORBIDDEN = 10003,
  /** 资源不存在 */
  NOT_FOUND = 10004,
  /** 资源冲突（重复等） */
  CONFLICT = 10005,
  /** 请求过于频繁 */
  TOO_MANY_REQUESTS = 10006,

  // ---------- 2xxxx 认证与账号 ----------
  /** 用户名或密码错误 */
  PASSWORD_INCORRECT = 20001,
  /** 账号不存在 */
  USER_NOT_FOUND = 20002,
  /** 账号已被禁用 */
  USER_DISABLED = 20003,
  /** 账号因多次登录失败被临时锁定 */
  USER_LOCKED = 20004,
  /** 用户名已存在 */
  USERNAME_EXISTS = 20005,
  /** 原密码不正确 */
  OLD_PASSWORD_INCORRECT = 20006,
  /** 账号角色不允许登录该客户端（端归属不匹配） */
  PORTAL_NOT_ALLOWED = 20007,

  // ---------- 3xxxx 商户（租户） ----------
  /** 商户不存在 */
  MERCHANT_NOT_FOUND = 30001,
  /** 商户已被禁用或已过期 */
  MERCHANT_DISABLED = 30002,
  /** 商户名称已存在 */
  MERCHANT_NAME_EXISTS = 30003,
  /** 缺少租户上下文 */
  TENANT_CONTEXT_MISSING = 30004,

  // ---------- 4xxxx 门店 ----------
  /** 门店不存在 */
  STORE_NOT_FOUND = 40001,
  /** 同商户下门店名称已存在 */
  STORE_NAME_EXISTS = 40002,
  /** 门店下仍有订单，不能删除 */
  STORE_IN_USE = 40003,

  // ---------- 5xxxx 菜品分类 ----------
  /** 菜品分类不存在 */
  CATEGORY_NOT_FOUND = 50001,
  /** 同商户下分类名称已存在 */
  CATEGORY_NAME_EXISTS = 50002,
  /** 分类下仍有菜品，不能删除 */
  CATEGORY_IN_USE = 50003,

  // ---------- 6xxxx 菜品 ----------
  /** 菜品不存在 */
  DISH_NOT_FOUND = 60001,
  /** 同商户下菜品名称已存在 */
  DISH_NAME_EXISTS = 60002,
  /** 所选分类不属于当前商户 */
  DISH_CATEGORY_MISMATCH = 60003,

  // ---------- 7xxxx 规格 ----------
  /** 规格组不存在 */
  SPEC_GROUP_NOT_FOUND = 70001,
  /** 同商户下规格组名称已存在 */
  SPEC_GROUP_NAME_EXISTS = 70002,
  /** 规格组已被菜品引用，不能删除 */
  SPEC_GROUP_IN_USE = 70003,
  /** 所选规格组不属于当前商户 */
  SPEC_GROUP_MISMATCH = 70004,
  /** 规格项不存在或不属于该规格组 */
  SPEC_OPTION_NOT_FOUND = 70005,
  /** 单选规格组只能提交一个选项 */
  SPEC_SINGLE_LIMIT = 70006,

  // ---------- 8xxxx 订单 ----------
  /** 订单不存在 */
  ORDER_NOT_FOUND = 80001,
  /** 当前订单状态不允许该操作 */
  ORDER_STATUS_INVALID = 80002,
  /** 订单明细为空 */
  ORDER_ITEMS_EMPTY = 80003,
  /** 菜品不存在、已下架或不属于该门店所属商户 */
  ORDER_DISH_UNAVAILABLE = 80004,
  /** 规格选择不合法（缺必选项、单选多选、选项不属于该菜品） */
  ORDER_SPEC_INVALID = 80005,
  /** 门店不存在、已禁用或已打烊 */
  ORDER_STORE_CLOSED = 80006,
  /** 订单明细不存在 */
  ORDER_ITEM_NOT_FOUND = 80007,
  /** 重复提交（幂等令牌冲突） */
  ORDER_DUPLICATE_SUBMIT = 80008,
  /** 代客开单未指定门店（商户管理员下辖多门店时必须明确） */
  ORDER_STORE_REQUIRED = 80009,
  /** 订单金额不合法（非正数，或超出单笔订单金额上限） */
  ORDER_AMOUNT_INVALID = 80010,

  // ---------- 9xxxx 支付 ----------
  /** 支付单不存在 */
  PAYMENT_NOT_FOUND = 90001,
  /** 当前支付单状态不允许该操作 */
  PAYMENT_STATUS_INVALID = 90002,
  /** 不支持的支付渠道 */
  PAYMENT_CHANNEL_UNSUPPORTED = 90003,
  /** 支付回调验签失败 */
  PAYMENT_SIGN_INVALID = 90004,
  /** 回调金额与支付单金额不一致 */
  PAYMENT_AMOUNT_MISMATCH = 90005,
  /** 该支付单不可退款（未成功 / 已退款） */
  PAYMENT_REFUND_NOT_ALLOWED = 90006,
  /** 退款失败 */
  PAYMENT_REFUND_FAILED = 90007,

  // ---------- 9xxxx 支付配置 ----------
  /** 支付渠道配置不存在 */
  PAYMENT_CONFIG_NOT_FOUND = 90008,
  /** 支付渠道配置字段不合法（必填缺失 / 格式不符 / 长度超限） */
  PAYMENT_CONFIG_FIELD_INVALID = 90009,
  /** 缺少敏感配置主密钥，或密文无法解密（主密钥被更换过） */
  PAYMENT_CONFIG_KEY_UNAVAILABLE = 90010,
}
