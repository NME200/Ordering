/**
 * 请求上下文中的顾客信息（C 端）。
 *
 * 与员工的 `AuthUser` 是**两套独立上下文**，字段刻意不重叠：
 * 顾客没有角色、没有权限点、也没有租户归属 —— 把两者混成一个接口，
 * 早晚会有人写出 `currentUser.merchantId ?? 顾客商户` 这种两边都成立的代码。
 */
export interface AuthCustomer {
  /** 顾客 ID（customers.id） */
  customerId: number;
  /** 设备标识，未绑定手机号时它是唯一的溯源线索 */
  visitorKey: string;
  /** 绑定手机号；未绑定为 null，资产类接口据此提示去绑定 */
  phone: string | null;
  /** 昵称，可能为空（前端按「食客 + ID 后四位」兜底显示） */
  nickname: string | null;
  /** 令牌唯一标识，用于登出 / 拉黑 */
  jti: string;
}
