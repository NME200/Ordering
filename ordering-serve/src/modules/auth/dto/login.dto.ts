import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Portal } from '../../../shared/enums/portal.enum';

/** 账号登录入参 */
export class LoginDto {
  @ApiProperty({ description: '登录用户名', example: 'admin', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(32, { message: '用户名最长 32 个字符' })
  username!: string;

  @ApiProperty({ description: '登录密码', example: 'Abc123456', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(32, { message: '密码最长 32 位' })
  password!: string;

  /**
   * 登录的客户端。
   *
   * 端归属由服务端校验：角色不属于该端时直接拒登。
   * 前端隐藏入口只是体验优化，真正的拦截在这里。
   */
  @ApiProperty({ description: '登录的客户端', enum: Portal, example: Portal.ADMIN })
  @IsEnum(Portal, { message: 'portal 取值不合法' })
  portal!: Portal;
}

