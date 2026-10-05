import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** 修改本人密码入参 */
export class ChangePasswordDto {
  @ApiProperty({ description: '原密码', example: 'Abc123456', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  @MaxLength(32, { message: '原密码最长 32 位' })
  oldPassword!: string;

  @ApiProperty({ description: '新密码', example: 'Abc654321', minLength: 6, maxLength: 32 })
  @IsString()
  @MinLength(6, { message: '新密码至少 6 位' })
  @MaxLength(32, { message: '新密码最长 32 位' })
  newPassword!: string;
}
