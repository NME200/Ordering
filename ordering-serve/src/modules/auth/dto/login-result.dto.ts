import { ApiProperty } from '@nestjs/swagger';
import { ProfileDto } from './profile.dto';

/** 登录成功返回结构 */
export class LoginResultDto {
  @ApiProperty({ description: '访问令牌（放到 Authorization: Bearer <token>）' })
  accessToken!: string;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: '令牌有效期', example: '7d' })
  expiresIn!: string;

  @ApiProperty({ description: '当前登录账号信息', type: ProfileDto })
  user!: ProfileDto;
}
