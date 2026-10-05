import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 重置员工密码入参（管理员操作，无需原密码） */
export class ResetPasswordDto {
  @ApiProperty({ description: '新密码', example: 'Abc123456', minLength: 6, maxLength: 32 })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最长 32 位' })
  newPassword!: string;
}
