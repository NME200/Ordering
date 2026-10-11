import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../shared/enums/error-code.enum';
import { CustomerAddressDto } from './dto/customer-address.dto';
import { CreateCustomerAddressDto, UpdateCustomerAddressDto } from './dto/customer-address.dto';
import { CustomerAddress } from './entities/customer-address.entity';

/** 单个顾客最多存多少条地址 */
const MAX_ADDRESS_PER_CUSTOMER = 20;

/**
 * 收货地址服务。
 *
 * 「默认」的唯一性不靠应用层记得清：每次设默认，都在同一个事务里
 * 先把该顾客其它地址的默认位清零再写目标行。少了这个事务，
 * 并发点两次「设为默认」会留下两条默认，下单时取到哪条全看运气。
 */
@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(CustomerAddress)
    private readonly addressRepository: Repository<CustomerAddress>,
    private readonly dataSource: DataSource,
  ) {}

  /** 列表：默认地址置顶，其余按最近更新排 */
  async list(customerId: number): Promise<CustomerAddressDto[]> {
    const rows = await this.addressRepository.find({
      where: { customerId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => CustomerAddressDto.from(row));
  }

  async create(customerId: number, dto: CreateCustomerAddressDto): Promise<CustomerAddressDto> {
    const total = await this.addressRepository.count({ where: { customerId } });
    if (total >= MAX_ADDRESS_PER_CUSTOMER) {
      throw BusinessException.badRequest(
        ErrorCode.ADDRESS_LIMIT,
        `最多保存 ${MAX_ADDRESS_PER_CUSTOMER} 个收货地址`,
      );
    }

    // 第一条无条件成为默认：外卖下单要能直接提交，不该先让顾客做一次选择
    const wantDefault = dto.isDefault === 1 || total === 0;

    const address = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CustomerAddress);
      if (wantDefault) {
        await repo.update({ customerId }, { isDefault: 0 });
      }
      return repo.save(
        repo.create({
          customerId,
          receiverName: dto.receiverName.trim(),
          phone: dto.phone,
          province: dto.province.trim(),
          city: dto.city.trim(),
          district: dto.district.trim(),
          detail: dto.detail.trim(),
          tag: dto.tag?.trim() || null,
          isDefault: wantDefault ? 1 : 0,
        }),
      );
    });

    return CustomerAddressDto.from(address);
  }

  async update(
    customerId: number,
    addressId: number,
    dto: UpdateCustomerAddressDto,
  ): Promise<CustomerAddressDto> {
    const address = await this.findOwnOrFail(customerId, addressId);

    if (dto.receiverName !== undefined) address.receiverName = dto.receiverName.trim();
    if (dto.phone !== undefined) address.phone = dto.phone;
    if (dto.province !== undefined) address.province = dto.province.trim();
    if (dto.city !== undefined) address.city = dto.city.trim();
    if (dto.district !== undefined) address.district = dto.district.trim();
    if (dto.detail !== undefined) address.detail = dto.detail.trim();
    if (dto.tag !== undefined) address.tag = dto.tag.trim() || null;

    if (dto.isDefault === 1) {
      return this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(CustomerAddress);
        await repo.update({ customerId }, { isDefault: 0 });
        address.isDefault = 1;
        return CustomerAddressDto.from(await repo.save(address));
      });
    }

    // 显式取消默认是允许的不带默认地址下单，但「编辑时顺手清掉默认」不该静默发生
    if (dto.isDefault === 0 && address.isDefault === 1) {
      address.isDefault = 0;
    }

    return CustomerAddressDto.from(await this.addressRepository.save(address));
  }

  async setDefault(customerId: number, addressId: number): Promise<CustomerAddressDto> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CustomerAddress);
      const address = await this.findOwnOrFail(customerId, addressId, manager);
      await repo.update({ customerId }, { isDefault: 0 });
      address.isDefault = 1;
      return CustomerAddressDto.from(await repo.save(address));
    });
  }

  /**
   * 删除地址。
   *
   * 删掉的正是默认地址时，把剩下最新的一条顶上来 ——
   * 顾客的外卖下单页不该因为「删了个地址」突然没有默认收件人。
   */
  async remove(customerId: number, addressId: number): Promise<void> {
    const address = await this.findOwnOrFail(customerId, addressId);
    await this.addressRepository.softDelete({ id: address.id, customerId });

    if (address.isDefault !== 1) {
      return;
    }
    const next = await this.addressRepository.findOne({
      where: { customerId },
      order: { id: 'DESC' },
    });
    if (next) {
      await this.addressRepository.update({ id: next.id }, { isDefault: 1 });
    }
  }

  /** 取本人地址；越权访问一律 404，不暴露「这条地址存在但不是你的」 */
  async findOwnOrFail(
    customerId: number,
    addressId: number,
    manager = this.dataSource.manager,
  ): Promise<CustomerAddress> {
    const address = await manager.getRepository(CustomerAddress).findOne({
      where: { id: addressId, customerId },
    });
    if (!address) {
      throw BusinessException.notFound(ErrorCode.ADDRESS_NOT_FOUND, '收货地址不存在');
    }
    return address;
  }

  /** 下单时拼地址快照用 */
  snapshot(address: CustomerAddress): string {
    return `${address.receiverName} ${address.phone} ${address.province}${address.city}${address.district}${address.detail}`;
  }
}
