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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../shared/enums/permission.enum';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { MerchantResponseDto } from './dto/merchant-response.dto';
import { QueryMerchantDto } from './dto/query-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { MerchantService } from './merchant.service';

/**
 * 商户管理接口（平台端）。
 *
 * 商户是租户体系的根，商户侧任何角色都不会拿到 `merchant:*`，
 * 因此这里**不再叠 `@Roles`**，改由 `@Permissions` 单独把关：
 * 平台运营专员能被授权到哪一档，完全由平台管理员勾选的权限点决定。
 */
@ApiTags('商户管理')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get()
  @Permissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: '分页查询商户列表' })
  paginate(@Query() query: QueryMerchantDto): Promise<PaginatedDto<MerchantResponseDto>> {
    return this.merchantService.paginate(query);
  }

  @Get(':id')
  @Permissions(Permission.MERCHANT_READ)
  @ApiOperation({ summary: '查询商户详情' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<MerchantResponseDto> {
    return this.merchantService.findOne(id);
  }

  @Post()
  @Permissions(Permission.MERCHANT_CREATE)
  @ApiOperation({ summary: '新增商户' })
  create(@Body() dto: CreateMerchantDto): Promise<MerchantResponseDto> {
    return this.merchantService.create(dto);
  }

  @Put(':id')
  @Permissions(Permission.MERCHANT_UPDATE)
  @ApiOperation({ summary: '编辑商户' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
  ): Promise<MerchantResponseDto> {
    return this.merchantService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.MERCHANT_DELETE)
  @ApiOperation({ summary: '删除商户（软删除）' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.merchantService.remove(id);
  }
}
