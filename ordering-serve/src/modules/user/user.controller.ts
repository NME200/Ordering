import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserService } from './user.service';

/**
 * 账号管理接口。
 *
 * 同一个资源承载两类页签，能力边界由 UserService 按「谁在操作谁的账号」判定：
 * - **平台账户**（平台端「平台账户」页签）：仅平台管理员可增删改与授权；
 * - **商家账户**（平台端「商家账户」页签 + 「商户详情 → 员工账号」下钻）：
 *   平台侧只可 `user:read` 查看、`user:update` 封禁与重置密码；
 * - **商户员工**（商户后台「员工账号」页签）：商户管理员在本商户内完整维护。
 *
 * 可见范围由租户范围解析保证：商户侧角色永远只看得到本商户 / 本店账号。
 */
@ApiTags('账号管理')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Permissions(Permission.USER_READ)
  @ApiOperation({ summary: '分页查询账号（支持平台账户 / 商家账户分类）' })
  paginate(
    @Query() query: QueryUserDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<PaginatedDto<UserResponseDto>> {
    return this.userService.paginate(query, currentUser);
  }

  @Get(':id')
  @Permissions(Permission.USER_READ)
  @ApiOperation({ summary: '查询账号详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<UserResponseDto> {
    return this.userService.findOne(id, currentUser);
  }

  @Post()
  @Permissions(Permission.USER_CREATE)
  @ApiOperation({ summary: '新增账号（平台账户仅平台管理员；商家账号仅商户侧）' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<UserResponseDto> {
    return this.userService.create(dto, currentUser);
  }

  @Put(':id')
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: '编辑账号（平台端对商家账号仅可变更启用状态）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, dto, currentUser);
  }

  @Put(':id/password')
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: '重置员工密码' })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.userService.resetPassword(id, dto, currentUser);
  }

  @Delete(':id')
  @Permissions(Permission.USER_DELETE)
  @ApiOperation({ summary: '删除账号（软删除；商家账号请由商家自行删除）' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.userService.remove(id, currentUser);
  }
}
