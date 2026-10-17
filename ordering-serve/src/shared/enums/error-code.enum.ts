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
  /** 该桌号在本店已存在（软删后允许复用，所以只在服务层判重） */
  STORE_TABLE_EXISTS = 40004,
  /** 桌号在本店不存在或已停用：扫码带出来的桌号要能对上后台维护的台位 */
  STORE_TABLE_UNUSABLE = 40005,

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

  // ---------- 9xxxx 支付渠道调用 ----------
  /** 调用真实渠道接口失败（被渠道拒绝、超时或返回体读不懂） */
  PAYMENT_CHANNEL_ERROR = 90011,

  // ---------- 10xxxx 顾客账号 ----------
  /** 顾客账号不存在 */
  CUSTOMER_NOT_FOUND = 100001,
  /** 登录令牌不合法或已失效 */
  CUSTOMER_TOKEN_INVALID = 100002,
  /** 手机号已被其他账号绑定 */
  CUSTOMER_PHONE_EXISTS = 100003,
  /** 短信验证码错误或已过期 */
  CUSTOMER_CODE_INVALID = 100004,
  /** 验证码获取过于频繁 */
  CUSTOMER_CODE_TOO_MANY = 100005,
  /** 收货地址不存在或不属于当前顾客 */
  ADDRESS_NOT_FOUND = 100006,
  /** 收货地址数量超限 */
  ADDRESS_LIMIT = 100007,
  /** 微信侧登录 / 手机号组件失败（凭据缺失、code 失效、额度用完、用户取消） */
  CUSTOMER_WECHAT_FAILED = 100008,

  // ---------- 11xxxx 优惠券 ----------
  /** 券模板不存在 */
  COUPON_TEMPLATE_NOT_FOUND = 110001,
  /** 券已领完 / 库存不足 */
  COUPON_SOLD_OUT = 110002,
  /** 已超过每人限领数量 */
  COUPON_LIMIT_EXCEEDED = 110003,
  /** 该券不属于领券中心（新客券 / 生日券由服务端发放） */
  COUPON_NOT_RECEIVABLE = 110004,
  /** 顾客持有的券不存在或不属于本人 */
  CUSTOMER_COUPON_NOT_FOUND = 110005,
  /** 券当前状态不可用（已使用 / 已过期 / 被别的订单占用） */
  COUPON_NOT_USABLE = 110006,
  /** 订单金额未达到券的使用门槛 */
  COUPON_THRESHOLD_NOT_MET = 110007,
  /** 券不适用于当前商户（平台券除外） */
  COUPON_MERCHANT_MISMATCH = 110008,

  // ---------- 12xxxx 会员与积分 ----------
  /** 生日信息已登记，不能重复修改用于领生日券 */
  MEMBER_BIRTHDAY_LOCKED = 120001,
  /** 积分余额不足 */
  POINT_NOT_ENOUGH = 120002,

  // ---------- 13xxxx 评价 ----------
  /** 订单不存在或不属于当前顾客，无法评价 */
  REVIEW_ORDER_INVALID = 130001,
  /** 该订单已评价过 */
  REVIEW_ALREADY_EXISTS = 130002,
  /** 评价不存在 */
  REVIEW_NOT_FOUND = 130003,

  // ---------- 14xxxx 发票 ----------
  /** 发票抬头不存在 */
  INVOICE_TITLE_NOT_FOUND = 140001,
  /** 开票申请不存在 */
  INVOICE_NOT_FOUND = 140002,
  /** 该订单不可开票（未完成、超窗口期或已申请过） */
  INVOICE_ORDER_INVALID = 140003,

  // ---------- 15xxxx 在线客服 ----------
  /** 会话不存在或不属于当前账号 */
  SERVICE_SESSION_NOT_FOUND = 150001,

  // ---------- 16xxxx 排队叫号 ----------
  /** 排队记录不存在 */
  QUEUE_NOT_FOUND = 160001,
  /** 当前状态不允许该操作 */
  QUEUE_STATUS_INVALID = 160002,
  /** 已有进行中的排队，请先取消 */
  QUEUE_ALREADY_ACTIVE = 160003,

  // ---------- 17xxxx 小程序配置 ----------
  /** 小程序凭据未配齐：AppID / AppSecret 缺一项就没法调微信接口 */
  MINIAPP_CONFIG_INCOMPLETE = 170001,
  /** 微信接口调用失败：把对方的 errcode + errmsg 原样带回，别让运营猜 */
  MINIAPP_WECHAT_API_FAILED = 170002,

  // ---------- 18xxxx 积分活动 ----------
  /** 积分活动不存在 */
  POINT_ACTIVITY_NOT_FOUND = 180001,
  /**
   * 与已有活动时间窗 + 商户范围重叠。
   *
   * 刻意不允许多个活动同时压在同一家商户头上：倍率与满额返怎么叠、上限按谁算，
   * 每一个仲裁规则都会变成顾客问、店员答不清的那笔账。
   */
  POINT_ACTIVITY_OVERLAP = 180002,
  /** 规则字段与所选类型不符 */
  POINT_ACTIVITY_RULE_INVALID = 180003,
  /** 活动已发放过积分，不允许删除（历史流水要能指回活动名） */
  POINT_ACTIVITY_IN_USE = 180004,

  // ---------- 19xxxx 图片上传 ----------
  /** 请求里没有找到文件（表单字段名必须是 file） */
  UPLOAD_FILE_REQUIRED = 190001,
  /** 不是受支持的图片：MIME 与文件头对不上，或压根不是图片 */
  UPLOAD_FILE_TYPE_INVALID = 190002,
  /** 超过单文件大小上限 */
  UPLOAD_FILE_TOO_LARGE = 190003,
}
