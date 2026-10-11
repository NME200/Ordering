import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CustomerGender } from '../../../shared/enums/customer.enum';

/** 手机号：只收大陆 11 位。国际号码本轮不支持，放宽会让打码逻辑全部失效 */
export const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/**
 * 微信下发的一次性凭据（wx.login 的 code、手机号组件的 code）。
 *
 * 口径只有一条：够长、字符集安全。不校验具体形状是因为微信换过一次格式
 * 就把顾客挡在门外，代价太不对称 —— 真不合法让接口去报错。
 */
const WX_CODE_PATTERN = /^[\w=-]{10,128}$/;

/** 静默注册入参 */
export class CustomerSessionDto {
  @ApiProperty({
    description: '设备标识，由小程序生成并持久化（utils/visitor.ts）',
    maxLength: 64,
  })
  @IsString({ message: 'visitorKey 必须为字符串' })
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'visitorKey 格式不合法' })
  visitorKey!: string;

  /**
   * `wx.login` 的 code。带上就顺手把微信身份绑上；
   * 换不到 openid（凭据没配、code 过期）不影响本次登录，只是这个账号还认设备。
   */
  @ApiPropertyOptional({ description: 'wx.login 返回的 code，小程序端才有', maxLength: 128 })
  @IsOptional()
  @IsString()
  @Matches(WX_CODE_PATTERN, { message: 'wxCode 格式不合法' })
  wxCode?: string;

  @ApiPropertyOptional({ description: '邀请码，注册时带上即建立邀请关系', maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '邀请码最长 16 个字符' })
  inviteCode?: string;

  @ApiPropertyOptional({ description: '当前所在商户 ID，用于首登时自动发新客券', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'merchantId 必须为整数' })
  @Min(1, { message: 'merchantId 最小为 1' })
  merchantId?: number;
}

/** 给已有登录态补绑微信身份 */
export class BindWechatOpenidDto {
  @ApiProperty({ description: 'wx.login 返回的 code（五分钟有效、只能用一次）', maxLength: 128 })
  @Matches(WX_CODE_PATTERN, { message: 'code 格式不合法' })
  code!: string;
}

/** 「手机号快速验证组件」一键绑定 */
export class BindWechatPhoneDto {
  @ApiProperty({
    description: 'button open-type=getPhoneNumber 回调里的 e.detail.code',
    maxLength: 128,
  })
  @Matches(WX_CODE_PATTERN, { message: 'code 格式不合法' })
  code!: string;
}

/**
 * 头像：只收「能直接渲染」的三种情况。
 *
 * 微信 chooseAvatar 给的是临时路径，前端必须转成 data:image base64 再传，
 * 所以这里既放行外链 URL（历史数据与后台手填），也放行 base64，
 * 还放行**空串**（顾客要清掉头像）；其余一律拒 —— 存进库里的必须能直接渲染。
 */
const AVATAR_PATTERN = /^(|https?:\/\/\S+|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+)$/;

/** base64 头像的封顶：前端压到 256px 约 8-15KB，200K 字符已经宽松 */
const AVATAR_MAX_LENGTH = 200_000;

/** 修改本人资料 */
export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({
    description: '昵称。小程序里用 type=nickname 输入框，顾客点一下键盘上方的建议即为微信昵称',
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '昵称最长 32 个字符' })
  nickname?: string;

  @ApiPropertyOptional({
    description: '头像：http(s) 外链，或 data:image/png;base64 形式（微信头像走这条）',
    maxLength: AVATAR_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(AVATAR_MAX_LENGTH, { message: '头像过大，请压缩后再上传' })
  @Matches(AVATAR_PATTERN, { message: '头像只支持图片外链或 base64 数据' })
  avatar?: string;

  @ApiPropertyOptional({ description: '性别：0 未填写 / 1 男 / 2 女', enum: CustomerGender })
  @IsOptional()
  @Type(() => Number)
  @IsIn([CustomerGender.UNKNOWN, CustomerGender.MALE, CustomerGender.FEMALE], {
    message: 'gender 只能是 0 / 1 / 2',
  })
  gender?: CustomerGender;

  /**
   * 生日只允许**首次填写**。
   *
   * 生日券按「生日当月」判定，可改的话顾客每年 12 月把生日改成 12 月就能重复领，
   * 所以这条不是保守，是这套营销的兑现前提。
   */
  @ApiPropertyOptional({ description: '生日，格式 YYYY-MM-DD，登记后不可修改', example: '1996-05-20' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'birthday 格式应为 YYYY-MM-DD',
  })
  birthday?: string;
}

/** 申请短信验证码 */
export class SendPhoneCodeDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @Matches(PHONE_PATTERN, { message: '手机号格式不正确' })
  phone!: string;
}

/** 绑定手机号 */
export class BindPhoneDto extends SendPhoneCodeDto {
  @ApiProperty({ description: '6 位验证码' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}
