import { Type, type ClassConstructor } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { APP_LINK_PATTERN } from '../../../shared/constants/app-entry';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const IMAGE_URL = { require_tld: false, protocols: ['http', 'https'] as string[] };

/**
 * 弹窗类型。
 *
 * 只有两类是**现在就真能跑通**的：图文型（一张活动图 + 跳转）与公告型（标题 + 正文）。
 * 设计稿里的 `coupon` / `newcomer` / `signup` 依赖券模板、发放记录与顾客账号，
 * 那三张表还没落地 —— 先把枚举摆出来等于让运营配出一个点不动的弹窗，
 * 所以等营销域落地再往这里加值。
 */
export enum PopupType {
  IMAGE = 'image',
  NOTICE = 'notice',
}

export const POPUP_TYPE_LABELS: Record<PopupType, string> = {
  [PopupType.IMAGE]: '图文弹窗',
  [PopupType.NOTICE]: '公告弹窗',
};

/** 触发场景：小程序在对应时机调 PopupManager.trigger(scene) */
export enum PopupScene {
  APP_LAUNCH = 'app_launch',
  HOME = 'home',
  STORE_ENTER = 'store_enter',
  PAY_SUCCESS = 'pay_success',
}

export const POPUP_SCENE_LABELS: Record<PopupScene, string> = {
  [PopupScene.APP_LAUNCH]: '冷启动',
  [PopupScene.HOME]: '进首页',
  [PopupScene.STORE_ENTER]: '进店',
  [PopupScene.PAY_SUCCESS]: '支付成功',
};

/**
 * 频次。
 *
 * 判定在**小程序本地**做（`Storage` 里记 popupId + 日期），后端只留 show_log 做权威统计：
 * 匿名接口认不得「这个人」，把频次放服务端只会变成一个谁都能刷的接口。
 */
export enum PopupFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  ALWAYS = 'always',
}

/** 多弹窗排队方式：关一个再弹下一个，或只弹优先级最高的那个 */
export enum PopupQueueMode {
  QUEUE = 'queue',
  TOP_ONLY = 'top_only',
}

export class PopupImageContentDto {
  @IsUrl(IMAGE_URL, { message: '弹窗图片需为合法地址' })
  image!: string;

  @IsOptional()
  @Matches(APP_LINK_PATTERN, { message: 'link 需为 /pages/xxx/xxx 或 scan' })
  @MaxLength(200, { message: '跳转链接最长 200 个字符' })
  link?: string;

  /** 关闭按钮的位置：右上角叉，或底部「跳过」文字 */
  @IsOptional()
  @IsIn(['top-right', 'bottom-text'], { message: 'closeStyle 只能是 top-right 或 bottom-text' })
  closeStyle?: 'top-right' | 'bottom-text';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'maskAlpha 最多两位小数' })
  @Min(0, { message: 'maskAlpha 最小为 0' })
  @Max(1, { message: 'maskAlpha 最大为 1' })
  maskAlpha?: number;

  /** 图片建议尺寸（750 设计稿宽度下的 px），只影响排版不裁剪图片 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'width 必须为整数' })
  @Min(240, { message: '弹窗宽度最小 240' })
  @Max(690, { message: '弹窗宽度最大 690（留边）' })
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'height 必须为整数' })
  @Min(240, { message: '弹窗高度最小 240' })
  @Max(1000, { message: '弹窗高度最大 1000' })
  height?: number;
}

export class PopupNoticeContentDto {
  @IsString()
  @MaxLength(30, { message: '标题最长 30 个字符' })
  title!: string;

  @IsString()
  @MaxLength(200, { message: '正文最长 200 个字符' })
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12, { message: '按钮文案最长 12 个字符' })
  btnText?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'titleColor 需为 #RRGGBB 格式' })
  titleColor?: string;
}

/** type → 内容校验类，与装修组件用同一套「白名单 + 分派」机制 */
export const POPUP_CONTENT_SCHEMAS: Record<PopupType, ClassConstructor<object>> = {
  [PopupType.IMAGE]: PopupImageContentDto,
  [PopupType.NOTICE]: PopupNoticeContentDto,
};

export const POPUP_FREQUENCIES = Object.values(PopupFrequency);
export const POPUP_QUEUE_MODES = Object.values(PopupQueueMode);
export const POPUP_SCENES = Object.values(PopupScene);
