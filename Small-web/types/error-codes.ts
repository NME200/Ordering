/**
 * 业务码 —— 只列前端**真的会按它分流**的项，取值与
 * `ordering-serve/src/shared/enums/error-code.enum.ts` 对齐。
 *
 * 新增一条就要回后端对一眼：这里的数字对不上，前端会把「门店打烊」当成网络错误重试。
 */
export const ErrorCode = {
  SUCCESS: 0,
  UNKNOWN: 10000,
  PARAM_INVALID: 10001,
  /** 匿名接口限流：必须退避，不能继续重试 */
  TOO_MANY_REQUESTS: 10006,
  /** 门店不存在 / 被停用 / 商户过期，后端刻意合并成同一个码 */
  STORE_NOT_FOUND: 40001,
  ORDER_NOT_FOUND: 80001,
  ORDER_STATUS_INVALID: 80002,
  /** 下单时菜品已下架或沽清 */
  ORDER_DISH_UNAVAILABLE: 80004,
  /** 下单时规格已失效 */
  ORDER_SPEC_INVALID: 80005,
  /** 门店当前不接单（打烊） */
  ORDER_STORE_CLOSED: 80006,
  /** 前端自造：断网、超时、小程序请求被拒 */
  NETWORK: -1,
} as const;
