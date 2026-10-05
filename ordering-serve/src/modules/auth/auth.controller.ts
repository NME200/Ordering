import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResultDto } from './dto/login-result.dto';
import { ProfileDto } from './dto/profile.dto';

/**
 * 认证接口。
 *
 * 除登录外都需要携带 Token；登录接口用 @Public() 放行。
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '账号登录' })
  login(@Body() dto: LoginDto): Promise<LoginResultDto> {
    return this.authService.login(dto);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录账号信息与权限点' })
  profile(@CurrentUser() currentUser: AuthUser): Promise<ProfileDto> {
    return this.authService.getProfile(currentUser);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出登录（当前 Token 立即失效）' })
  logout(@CurrentUser() currentUser: AuthUser): Promise<void> {
    return this.authService.logout(currentUser);
  }

  @Put('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改本人密码（修改后需重新登录）' })
  changePassword(
    @CurrentUser() currentUser: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(currentUser, dto);
  }
}
