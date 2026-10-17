/**
 * 枚举与中文名 —— 与后端 `ordering-serve/src/shared/enums` 一一对应。
 *
 * 前后端共用同一套标识（见 CODEBUDDY.md 8.2），
 * 前端不得自行发明新的取值或权限点字符串。
 */

/* ============================================================
 * 客户端（端）
 * ============================================================ */

/**
 * 客户端标识。
 *
 * 「端」与「角色」是正交的两个维度：端决定**从哪个入口登录**（服务端校验），
 * 角色决定**拥有哪些权限点**。Admin-web 固定使用 `ADMIN`。
 */
export enum Portal {
  /** 平台管理端（本工程） */
  ADMIN = 'admin',
  /** 商户后台（Merchant-web） */
  MERCHANT = 'merchant',
  /** 收银台（Cashier-web） */
  CASHIER = 'cashier',
}

/** 端中文名 */
export const PORTAL_LABELS: Record<Portal, string> = {
  [Portal.ADMIN]: '平台管理端',
  [Portal.MERCHANT]: '商户后台',
  [Portal.CASHIER]: '收银台',
};

/* ============================================================
 * 角色
 * ============================================================ */

/** 分层角色：平台管理员 / 运营专员 → 商户管理员 → 门店管理员 → 收银员 */
export enum Role {
  PLATFORM_ADMIN = 'platform_admin',
  PLATFORM_OPERATOR = 'platform_operator',
  MERCHANT_ADMIN = 'merchant_admin',
  STORE_MANAGER = 'store_manager',
  CASHIER = 'cashier',
}

/** 角色中文名 */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: '平台管理员',
  [Role.PLATFORM_OPERATOR]: '平台运营专员',
  [Role.MERCHANT_ADMIN]: '商户管理员',
  [Role.STORE_MANAGER]: '门店管理员',
  [Role.CASHIER]: '收银员',
};

/**
 * 平台侧角色（账户管理里的「平台账户」）。
 * 运营专员的权限点不在角色里，由平台管理员在账号上逐项授权。
 */
export const PLATFORM_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.PLATFORM_OPERATOR];

/**
 * 商家自己可开通 / 可维护的员工角色。
 * 商户管理员由平台在建商户时开通，商家既不能再开一个，也不能改或删。
 */
export const STAFF_ROLES: Role[] = [Role.STORE_MANAGER, Role.CASHIER];

/**
 * 平台端「账户管理」的分类口径，与后端 `shared/enums/account-kind.enum.ts` 对齐。
 * 分类到角色的展开只在服务端做，前端不传角色清单。
 */
export enum AccountKind {
  /** 平台账户 */
  PLATFORM = 'platform',
  /** 商家账户（各商户的管理员） */
  MERCHANT_ADMIN = 'merchant_admin',
}

/**
 * 封禁发起方，与后端 `shared/enums/account-ban-source.enum.ts` 对齐。
 * 谁封的谁解：另一侧既解不开对方的封，也不能重复封。
 */
export enum AccountBanSource {
  PLATFORM = 'platform',
  MERCHANT = 'merchant',
}

/** 封禁方中文名 */
export const BAN_SOURCE_LABELS: Record<AccountBanSource, string> = {
  [AccountBanSource.PLATFORM]: '平台',
  [AccountBanSource.MERCHANT]: '商户',
};

/* ============================================================
 * 权限点
 * ============================================================ */

/** 权限点标识，命名规则 `<资源>:<动作>` */
export enum Permission {
  MERCHANT_CREATE = 'merchant:create',
  MERCHANT_READ = 'merchant:read',
  MERCHANT_UPDATE = 'merchant:update',
  MERCHANT_DELETE = 'merchant:delete',

  STORE_CREATE = 'store:create',
  STORE_READ = 'store:read',
  STORE_UPDATE = 'store:update',
  STORE_DISABLE = 'store:disable',
  STORE_DELETE = 'store:delete',

  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',

  CATEGORY_CREATE = 'category:create',
  CATEGORY_READ = 'category:read',
  CATEGORY_UPDATE = 'category:update',
  CATEGORY_DELETE = 'category:delete',

  DISH_CREATE = 'dish:create',
  DISH_READ = 'dish:read',
  DISH_UPDATE = 'dish:update',
  DISH_DELETE = 'dish:delete',

  SPEC_CREATE = 'spec:create',
  SPEC_READ = 'spec:read',
  SPEC_UPDATE = 'spec:update',
  SPEC_DELETE = 'spec:delete',

  /** 订单：开单（收银台代客开单） */
  ORDER_CREATE = 'order:create',
  /** 订单：查看 */
  ORDER_READ = 'order:read',
  /** 订单：操作（接单 / 出餐 / 完成 / 线下收款） */
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

  /** 活动弹窗：查看配置与投放数据 */
  POPUP_READ = 'popup:read',
  /** 活动弹窗：新建 / 修改 / 下线 */
  POPUP_UPDATE = 'popup:update',

  /** 顾客账号与会员资产：查看 */
  CUSTOMER_READ = 'customer:read',
  /** 顾客账号：封禁 / 解封（平台端没有这个权限点，封禁是商户动作） */
  CUSTOMER_UPDATE = 'customer:update',

  /** 优惠券模板与发放记录：查看 */
  COUPON_READ = 'coupon:read',
  /** 优惠券模板：新建 / 修改 / 上下架（平台端只能作用于 merchantId 为空的平台券） */
  COUPON_UPDATE = 'coupon:update',

  /** 顾客评价：查看 */
  REVIEW_READ = 'review:read',
  /** 顾客评价：商家回复 */
  REVIEW_UPDATE = 'review:update',

  /** 开票申请：查看 */
  INVOICE_READ = 'invoice:read',
  /** 开票申请：受理（受理 / 回填发票号 / 驳回） */
  INVOICE_UPDATE = 'invoice:update',

  /** 在线客服会话：查看 */
  SERVICE_READ = 'service:read',
  /** 在线客服会话：以客服身份回复 / 结束会话 */
  SERVICE_UPDATE = 'service:update',

  /** 排队叫号：查看队列 */
  QUEUE_READ = 'queue:read',
  /** 排队叫号：门店代客取号 */
  QUEUE_CREATE = 'queue:create',
  /** 排队叫号：叫号 / 入座 / 过号 / 召回 */
  QUEUE_UPDATE = 'queue:update',

  /** 小程序配置（凭据 / 扫码规则 / 桌号二维码）：查看 */
  MINIAPP_READ = 'miniapp:read',
  /** 小程序配置：修改凭据与扫码规则、生成桌号二维码 */
  MINIAPP_UPDATE = 'miniapp:update',

  /** 积分活动：查看规则与发放统计（商户端读的是「本店参与中」，不是配置权） */
  POINT_ACTIVITY_READ = 'point-activity:read',
  /** 积分活动：新建 / 编辑 / 启停 / 删除（平台管理员独占，控制器另有角色硬锁） */
  POINT_ACTIVITY_UPDATE = 'point-activity:update',
}

/* ============================================================
 * 状态
 * ============================================================ */

/** 通用启用 / 禁用状态 */
export enum CommonStatus {
  DISABLED = 0,
  ENABLED = 1,
}

/** 通用状态中文名 */
export const COMMON_STATUS_LABELS: Record<CommonStatus, string> = {
  [CommonStatus.DISABLED]: '禁用',
  [CommonStatus.ENABLED]: '启用',
};

/** 菜品上下架状态 */
export enum DishStatus {
  OFF_SHELF = 0,
  ON_SHELF = 1,
}

/** 菜品状态中文名 */
export const DISH_STATUS_LABELS: Record<DishStatus, string> = {
  [DishStatus.OFF_SHELF]: '已下架',
  [DishStatus.ON_SHELF]: '已上架',
};

/** 门店营业状态 */
export enum BusinessStatus {
  CLOSED = 0,
  OPEN = 1,
}

/** 营业状态中文名 */
export const BUSINESS_STATUS_LABELS: Record<BusinessStatus, string> = {
  [BusinessStatus.CLOSED]: '打烊',
  [BusinessStatus.OPEN]: '营业中',
};

/** 规格组选购方式 */
export enum SpecType {
  SINGLE = 1,
  MULTI = 2,
}

/** 选购方式中文名 */
export const SPEC_TYPE_LABELS: Record<SpecType, string> = {
  [SpecType.SINGLE]: '单选',
  [SpecType.MULTI]: '多选',
};

/* ============================================================
 * 订单 / 支付
 * ============================================================ */

/**
 * 订单状态。
 *
 * 取值按流程顺序递增，便于「大于某状态」这类范围判断。
 * 流转规则由后端 `order-status-flow.ts` 校验，前端只做展示与可用操作推导。
 */
export enum OrderStatus {
  /** 待支付 */
  PENDING_PAYMENT = 10,
  /** 已支付 / 待接单 */
  PAID = 20,
  /** 制作中（商户已接单） */
  PREPARING = 30,
  /** 待取餐（商户已出餐） */
  READY = 40,
  /** 已完成 */
  COMPLETED = 50,
  /** 已取消 */
  CANCELLED = 60,
}

/** 订单状态中文名 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: '待支付',
  [OrderStatus.PAID]: '待接单',
  [OrderStatus.PREPARING]: '制作中',
  [OrderStatus.READY]: '待取餐',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.CANCELLED]: '已取消',
};

/** 订单状态取值（按流程顺序） */
export const ORDER_STATUS_VALUES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

/** 订单状态对应的 el-tag 类型，保证各页面配色一致 */
export const ORDER_STATUS_TAG_TYPES: Record<
  OrderStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  [OrderStatus.PENDING_PAYMENT]: 'warning',
  [OrderStatus.PAID]: 'danger',
  [OrderStatus.PREPARING]: 'primary',
  [OrderStatus.READY]: 'success',
  [OrderStatus.COMPLETED]: 'info',
  [OrderStatus.CANCELLED]: 'info',
};

/** 订单来源 */
export enum OrderSource {
  /** C 端扫码点餐（顾客自助下单） */
  SCAN = 'scan',
  /** 收银台代客开单（POS） */
  POS = 'pos',
}

/** 订单来源中文名 */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  [OrderSource.SCAN]: '扫码点餐',
  [OrderSource.POS]: '收银台开单',
};

/**
 * 就餐方式，与后端 `shared/enums/dining-type.enum.ts` 逐值对齐。
 *
 * 只记录与展示：三种方式的菜品与价格完全一致，起送价 / 配送费 / 促销后端没有表支撑，
 * 所以界面上不要根据它推算任何金额。
 */
export enum DiningType {
  /** 堂食（扫码点餐与收银台开单的默认值） */
  DINE_IN = 0,
  /** 到店自提：只有这一类订单会发放取餐码 */
  PICKUP = 1,
  /** 外卖配送 */
  DELIVERY = 2,
}

/** 就餐方式中文名 */
export const DINING_TYPE_LABELS: Record<DiningType, string> = {
  [DiningType.DINE_IN]: '堂食',
  [DiningType.PICKUP]: '自提',
  [DiningType.DELIVERY]: '外卖配送',
};

/** 支付单状态 */
export enum PaymentStatus {
  /** 待支付 */
  PENDING = 10,
  /** 支付成功 */
  SUCCESS = 20,
  /** 支付失败 */
  FAILED = 30,
  /** 已关闭 */
  CLOSED = 40,
}

/** 支付单状态中文名 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: '待支付',
  [PaymentStatus.SUCCESS]: '支付成功',
  [PaymentStatus.FAILED]: '支付失败',
  [PaymentStatus.CLOSED]: '已关闭',
};

/** 支付单状态对应的 el-tag 类型 */
export const PAYMENT_STATUS_TAG_TYPES: Record<
  PaymentStatus,
  'primary' | 'success' | 'info' | 'warning' | 'danger'
> = {
  [PaymentStatus.PENDING]: 'warning',
  [PaymentStatus.SUCCESS]: 'success',
  [PaymentStatus.FAILED]: 'danger',
  [PaymentStatus.CLOSED]: 'info',
};

/** 支付渠道 */
export enum PaymentChannel {
  /** 线下收款（现金 / 收款码），由商户手动标记 */
  OFFLINE = 'offline',
  /** 模拟在线支付（开发联调） */
  MOCK = 'mock',
  /** 微信支付 */
  WECHAT = 'wechat',
  /** 支付宝 */
  ALIPAY = 'alipay',
}

/** 支付渠道中文名 */
export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  [PaymentChannel.OFFLINE]: '线下收款',
  [PaymentChannel.MOCK]: '模拟支付',
  [PaymentChannel.WECHAT]: '微信支付',
  [PaymentChannel.ALIPAY]: '支付宝',
};

/** 退款状态 */
export enum RefundStatus {
  /** 未退款 */
  NONE = 0,
  /** 退款处理中 */
  PENDING = 10,
  /** 已退款 */
  SUCCESS = 20,
  /** 退款失败 */
  FAILED = 30,
}

/** 退款状态中文名 */
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  [RefundStatus.NONE]: '未退款',
  [RefundStatus.PENDING]: '退款中',
  [RefundStatus.SUCCESS]: '已退款',
  [RefundStatus.FAILED]: '退款失败',
};

/* ============================================================
 * 选项（供下拉 / 单选组直接使用）
 * ============================================================ */

/**
 * 把「值 → 中文名」映射转成下拉选项数组。
 *
 * 注意：数字枚举经 `Object.keys` 后键会变成字符串，这里还原为数字，
 * 否则 el-select 会把字符串写回 number 类型的查询字段，
 * 之后 `query.status === CommonStatus.ENABLED` 这类比较会静默失效。
 */
function toOptions<T extends number | string>(labels: Record<T, string>) {
  return (Object.keys(labels) as unknown as string[]).map((key) => {
    const numeric = Number(key);
    const value = (Number.isNaN(numeric) ? key : numeric) as unknown as T;
    return { label: labels[value], value };
  });
}

/** 角色下拉选项 */
export const ROLE_OPTIONS = toOptions<Role>(ROLE_LABELS);

/** 通用状态下拉选项 */
export const COMMON_STATUS_OPTIONS = toOptions<CommonStatus>(COMMON_STATUS_LABELS);

/** 菜品状态下拉选项 */
export const DISH_STATUS_OPTIONS = toOptions<DishStatus>(DISH_STATUS_LABELS);

/** 营业状态下拉选项 */
export const BUSINESS_STATUS_OPTIONS = toOptions<BusinessStatus>(BUSINESS_STATUS_LABELS);

/** 规格组类型下拉选项 */
export const SPEC_TYPE_OPTIONS = toOptions<SpecType>(SPEC_TYPE_LABELS);

/** 订单状态下拉选项 */
export const ORDER_STATUS_OPTIONS = toOptions<OrderStatus>(ORDER_STATUS_LABELS);

/** 订单来源下拉选项 */
export const ORDER_SOURCE_OPTIONS = toOptions<OrderSource>(ORDER_SOURCE_LABELS);

/** 就餐方式下拉选项 */
export const DINING_TYPE_OPTIONS = toOptions<DiningType>(DINING_TYPE_LABELS);

/** 支付状态下拉选项 */
export const PAYMENT_STATUS_OPTIONS = toOptions<PaymentStatus>(PAYMENT_STATUS_LABELS);

/** 支付渠道下拉选项 */
export const PAYMENT_CHANNEL_OPTIONS = toOptions<PaymentChannel>(PAYMENT_CHANNEL_LABELS);

/* ============================================================
 * 可授权权限点（平台运营专员的授权面板）
 * ============================================================ */

/**
 * 可下放给平台运营专员的权限点，按治理场景分组。
 * **必须与后端 `GRANTABLE_PERMISSIONS` 保持一致**（服务端会逐条校验并拒绝越界的清单）。
 *
 * 刻意不出现的四类：
 * - `payment-config:*`：资金级凭据，控制器上还有平台管理员硬锁；
 * - `user:create` / `user:delete`：平台账户的新增与删除归平台管理员，
 *   商家员工归商家自己，平台端没有这两个动作；
 * - `store:delete`：删店不可逆，留在平台管理员手里；日常停店用可逆的 `store:disable`；
 * - 其余经营类写权限（改菜单 / 接单 / 退款）：平台是治理方不是经营者。
 */
export const GRANTABLE_PERMISSION_GROUPS: { label: string; options: Permission[] }[] = [
  {
    label: '商户治理',
    options: [
      Permission.MERCHANT_READ,
      Permission.MERCHANT_CREATE,
      Permission.MERCHANT_UPDATE,
      Permission.MERCHANT_DELETE,
      // 门店的开通与停用属租户配置 / 止血动作，与商户治理放在一起授权
      Permission.STORE_CREATE,
      Permission.STORE_DISABLE,
    ],
  },
  {
    label: '账户治理',
    options: [Permission.USER_READ, Permission.USER_UPDATE],
  },
  {
    label: '业务数据只读排查',
    options: [
      Permission.STORE_READ,
      Permission.CATEGORY_READ,
      Permission.DISH_READ,
      Permission.SPEC_READ,
      Permission.ORDER_READ,
      Permission.PAYMENT_READ,
      // 顾客名册与券的读视图可以切给被授权的运营；改券（coupon:update）仍是平台管理员的动作
      Permission.CUSTOMER_READ,
      Permission.COUPON_READ,
    ],
  },
];

/** 权限点中文名，用于授权面板与详情页展示 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.MERCHANT_CREATE]: '新增商户（含开通商家管理员）',
  [Permission.MERCHANT_READ]: '查看商户',
  [Permission.MERCHANT_UPDATE]: '编辑商户 / 封禁与恢复商户',
  [Permission.MERCHANT_DELETE]: '删除商户',

  [Permission.USER_READ]: '查看商家账户与商户员工',
  [Permission.USER_UPDATE]: '封禁 / 解封商家账号、重置密码',
  [Permission.USER_CREATE]: '新增账号',
  [Permission.USER_DELETE]: '删除账号',

  [Permission.STORE_CREATE]: '开通门店',
  [Permission.STORE_READ]: '查看门店',
  [Permission.STORE_UPDATE]: '编辑门店资料',
  [Permission.STORE_DISABLE]: '禁用 / 恢复门店',
  [Permission.STORE_DELETE]: '删除门店',

  [Permission.CATEGORY_CREATE]: '新增菜品分类',
  [Permission.CATEGORY_READ]: '查看菜品分类',
  [Permission.CATEGORY_UPDATE]: '编辑菜品分类',
  [Permission.CATEGORY_DELETE]: '删除菜品分类',

  [Permission.DISH_CREATE]: '新增菜品',
  [Permission.DISH_READ]: '查看菜品',
  [Permission.DISH_UPDATE]: '编辑菜品 / 上下架',
  [Permission.DISH_DELETE]: '删除菜品',

  [Permission.SPEC_CREATE]: '新增规格组',
  [Permission.SPEC_READ]: '查看规格组',
  [Permission.SPEC_UPDATE]: '编辑规格组',
  [Permission.SPEC_DELETE]: '删除规格组',

  [Permission.ORDER_CREATE]: '代客开单',
  [Permission.ORDER_READ]: '查看订单',
  [Permission.ORDER_UPDATE]: '接单 / 出餐 / 完成',
  [Permission.ORDER_CANCEL]: '取消订单',

  [Permission.PAYMENT_READ]: '查看支付流水',
  [Permission.PAYMENT_REFUND]: '发起退款',

  [Permission.PAYMENT_CONFIG_READ]: '查看支付配置',
  [Permission.PAYMENT_CONFIG_UPDATE]: '修改支付配置',

  [Permission.APP_CONFIG_READ]: '查看小程序布局',
  [Permission.APP_CONFIG_UPDATE]: '修改与发布小程序布局',

  [Permission.POPUP_READ]: '查看活动弹窗',
  [Permission.POPUP_UPDATE]: '维护活动弹窗',

  [Permission.CUSTOMER_READ]: '查看顾客与会员资产',
  [Permission.CUSTOMER_UPDATE]: '封禁 / 解封顾客',

  [Permission.COUPON_READ]: '查看优惠券与发放记录',
  [Permission.COUPON_UPDATE]: '新建 / 修改优惠券',

  [Permission.REVIEW_READ]: '查看顾客评价',
  [Permission.REVIEW_UPDATE]: '回复顾客评价',

  [Permission.INVOICE_READ]: '查看开票申请',
  [Permission.INVOICE_UPDATE]: '受理开票申请（开票 / 驳回）',

  [Permission.SERVICE_READ]: '查看客服会话',
  [Permission.SERVICE_UPDATE]: '回复 / 结束客服会话',

  [Permission.QUEUE_READ]: '查看排队队列',
  [Permission.QUEUE_CREATE]: '门店代客取号',
  [Permission.QUEUE_UPDATE]: '叫号 / 入座 / 过号 / 召回',

  [Permission.MINIAPP_READ]: '查看小程序配置',
  [Permission.MINIAPP_UPDATE]: '修改小程序配置与生成桌号二维码',
  [Permission.POINT_ACTIVITY_READ]: '查看积分活动与发放统计',
  [Permission.POINT_ACTIVITY_UPDATE]: '新建 / 编辑 / 启停 / 删除积分活动',
};
