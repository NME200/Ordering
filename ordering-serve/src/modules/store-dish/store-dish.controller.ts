import { Body, Controller, Delete, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { Permission } from '../../shared/enums/permission.enum';
import { StoreDishResponseDto } from './dto/store-dish-response.dto';
import { UpsertStoreDishDto } from './dto/upsert-store-dish.dto';
import { StoreDishService } from './store-dish.service';

/**
 * 门店菜品例外接口。
 *
 * 读侧不单独开接口：`GET /dishes?storeId=` 已返回合并后的门店有效值，
 * 再加一个「有效菜单」端点只会造出第二套口径。
 * 这里只有写例外的两个动作，权限复用 `dish:update`，门店边界由服务端强制。
 */
@ApiTags('门店菜品例外')
@ApiBearerAuth()
@Controller('store-dishes')
export class StoreDishController {
  constructor(private readonly storeDishService: StoreDishService) {}

  @Put(':storeId/:dishId')
  @Permissions(Permission.DISH_UPDATE)
  @ApiOperation({
    summary: '设置本店例外（停售 / 门店价 / 沽清）',
    description:
      '只改传进来的字段。全部改回默认值时该行会被删除，即恢复跟随标准菜单。' +
      '门店账号只能设停售与沽清，门店价与会员价归商户管理员。',
  })
  upsert(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('dishId', ParseIntPipe) dishId: number,
    @Body() dto: UpsertStoreDishDto,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<StoreDishResponseDto | null> {
    return this.storeDishService.upsertForUser(storeId, dishId, dto, currentUser);
  }

  @Delete(':storeId/:dishId')
  @Permissions(Permission.DISH_UPDATE)
  @ApiOperation({ summary: '删除本店例外，恢复跟随标准菜单' })
  reset(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('dishId', ParseIntPipe) dishId: number,
    @CurrentUser() currentUser: AuthUser,
  ): Promise<void> {
    return this.storeDishService.resetForUser(storeId, dishId, currentUser);
  }
}
