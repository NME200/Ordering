/**
 * 顾客域类型。与后端 `modules/customer|coupon|review|invoice|service|queue` 的出参一一对应。
 *
 * 金额一律是**分**（后端整数分），显示前用 `formatYuan` 转元；
 * 前端不做任何金额计算，抵扣金额由服务端算好后回传。
 */

export interface CustomerProfile {
  id: number;
  nickname: string | null;
  avatar: string | null;
  gender: number;
  birthday: string | null;
  /** 已打码的手机号，如 138****8888 */
  phone: string | null;
  phoneBound: boolean;
  inviteCode: string | null;
  inviteCount: number;
}

export interface MemberLevel {
  level: number;
  name: string;
  needGrowth: number;
}

export interface MemberAsset {
  merchantId: number;
  point: number;
  balance: number;
  growth: number;
  level: number;
  levelName: string;
  nextLevel: (MemberLevel & { remainGrowth: number }) | null;
  couponCount: number;
  totalPaid: number;
  orderCount: number;
}

export type OrderBucket = 'unpaid' | 'processing' | 'review' | 'refund';

export interface CustomerOverview {
  profile: CustomerProfile;
  member: MemberAsset | null;
  orderCount: { buckets: Record<OrderBucket, number> };
}

export interface CustomerOrderItem {
  dishName: string;
  dishImageUrl: string | null;
  specSummary: string;
  unitPrice: number;
  specAmount: number;
  quantity: number;
  subtotal: number;
}

export interface CustomerOrder {
  id: number;
  orderNo: string;
  status: number;
  statusLabel: string;
  storeId: number;
  storeName: string;
  totalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number | null;
  itemCount: number;
  diningType: number;
  tableNo: string | null;
  /** 取餐码：仅自提单有，柜台前报这个而不是订单号 */
  pickupCode: string | null;
  addressSnapshot: string | null;
  remark: string | null;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** 支付方式文案；未支付为 null（后端从成功的支付单回填，订单表不存渠道） */
  paidChannelLabel: string | null;
  canReview: boolean;
  refunded: boolean;
  items: CustomerOrderItem[];
}

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PointLog {
  pointChange: number;
  pointAfter: number;
  reason: string;
  orderNo: string | null;
  createdAt: string;
}

export interface MemberTask {
  key: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  done: boolean;
}

export interface CustomerAddress {
  id: number;
  receiverName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  tag: string | null;
  isDefault: boolean;
  fullAddress: string;
  createdAt: string;
}

export interface CouponCenterItem {
  id: number;
  name: string;
  type: 'amount' | 'discount';
  value: number;
  threshold: number;
  maxDiscount: number | null;
  faceValue: string;
  thresholdText: string;
  description: string | null;
  expireAt: string | null;
  receivable: boolean;
  reason: string | null;
  receivedByMe: number;
}

export interface CustomerCoupon {
  id: number;
  templateId: number;
  merchantId: number | null;
  name: string;
  type: 'amount' | 'discount';
  value: number;
  threshold: number;
  maxDiscount: number | null;
  scene: 'normal' | 'newcomer' | 'birthday';
  expireAt: string;
  status: 'unused' | 'locked' | 'used' | 'expired';
  faceValue: string;
  thresholdText: string;
  receivedAt: string;
  usedAt: string | null;
  usable: boolean;
  unusableReason: string | null;
  discountPreview: number;
}

export interface ReviewDraft {
  orderId: number;
  rating: number;
  tags?: string[];
  content?: string;
  anonymous?: boolean;
}

export interface ReviewRow {
  id: number;
  orderId: number;
  orderNo: string;
  storeId: number;
  rating: number;
  tags: string[];
  content: string | null;
  images: string[];
  anonymous: boolean;
  customerName: string;
  pointAwarded: number;
  replyContent: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface InvoiceTitle {
  id: number;
  kind: 'personal' | 'enterprise';
  title: string;
  taxNo: string | null;
  email: string;
  isDefault: boolean;
}

export interface InvoiceableOrder {
  orderId: number;
  orderNo: string;
  storeName: string;
  amount: number;
  completedAt: string;
  remainDays: number;
}

export interface InvoiceRow {
  id: number;
  orderId: number;
  orderNo: string;
  amount: number;
  kind: 'personal' | 'enterprise';
  title: string;
  taxNo: string | null;
  email: string;
  status: 'pending' | 'issuing' | 'issued' | 'rejected';
  statusLabel: string;
  invoiceNo: string | null;
  invoiceUrl: string | null;
  remark: string | null;
  handleNote: string | null;
  createdAt: string;
  handledAt: string | null;
}

export interface ServiceSession {
  id: number;
  merchantId: number;
  storeId: number | null;
  orderId: number | null;
  status: 'open' | 'replied' | 'closed';
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface ServiceMessage {
  id: number;
  sender: 'customer' | 'staff';
  senderName: string;
  content: string;
  orderNo: string | null;
  createdAt: string;
}

export interface QueueRow {
  id: number;
  storeId: number;
  storeName: string;
  bizDate: string;
  tableType: string;
  tableTypeLabel: string;
  queueNo: string;
  partySize: number;
  status: 'waiting' | 'called' | 'seated' | 'passed' | 'cancelled';
  statusLabel: string;
  createdAt: string;
  calledAt: string | null;
  seatedAt: string | null;
  ahead: number;
  callingNo: string | null;
}

export interface QueueBoard {
  storeId: number;
  storeName: string;
  waiting: number;
  callingNo: string | null;
  byTableType: { tableType: string; label: string; waiting: number }[];
}
