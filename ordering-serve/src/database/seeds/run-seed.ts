import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../../app.module';
import { CommonStatus } from '../../shared/enums/common-status.enum';
import { DishStatus } from '../../shared/enums/dish-status.enum';
import {
  PAYMENT_CHANNEL_LABELS,
  PaymentChannel,
} from '../../shared/enums/payment-channel.enum';
import { Role } from '../../shared/enums/role.enum';
import { SpecType } from '../../shared/enums/spec-type.enum';
import { hashPassword } from '../../shared/utils/password.util';
import { PaymentConfig } from '../../modules/payment-config/entities/payment-config.entity';
import {
  decodeSettings,
  encodeSettings,
} from '../../modules/payment-config/utils/settings.codec';
import { DishCategory } from '../../modules/dish-category/entities/dish-category.entity';
import { DishSpecGroup } from '../../modules/dish/entities/dish-spec-group.entity';
import { Dish } from '../../modules/dish/entities/dish.entity';
import { Merchant } from '../../modules/merchant/entities/merchant.entity';
import { SpecGroup } from '../../modules/spec-group/entities/spec-group.entity';
import { SpecOption } from '../../modules/spec-group/entities/spec-option.entity';
import { Store } from '../../modules/store/entities/store.entity';
import { User } from '../../modules/user/entities/user.entity';

/**
 * 初始化种子数据（可重复执行，已存在则跳过）。
 *
 * 用法：npm run seed
 *
 * 会创建：
 * - 平台管理员 admin
 * - 演示商户「示例餐饮（演示）」+ 门店「人民路店」
 * - 商户管理员 merchant01、收银员 cashier01
 * - 演示菜单：分类 / 规格组 / 菜品（金额单位为「分」）
 */

/** 种子账号默认密码，仅用于本地开发，上线前务必修改 */
const SEED_PASSWORD = {
  platformAdmin: 'Admin@123456',
  merchantAdmin: 'Merchant@123456',
  cashier: 'Cashier@123456',
};

/** 演示菜单定义 */
const SEED_MENU = {
  categories: [
    { name: '热菜', sort: 1 },
    { name: '饮品', sort: 2 },
  ],
  specGroups: [
    {
      name: '杯型',
      type: SpecType.SINGLE,
      isRequired: true,
      sort: 1,
      options: [
        { name: '中杯', priceDiff: 0, sort: 1 },
        { name: '大杯', priceDiff: 300, sort: 2 },
      ],
    },
    {
      name: '加料',
      type: SpecType.MULTI,
      isRequired: false,
      sort: 2,
      options: [
        { name: '珍珠', priceDiff: 200, sort: 1 },
        { name: '椰果', priceDiff: 300, sort: 2 },
      ],
    },
  ],
  dishes: [
    {
      category: '热菜',
      name: '宫保鸡丁',
      description: '经典川菜，微辣',
      price: 3800,
      sort: 1,
      isRecommend: true,
      specGroups: [] as string[],
    },
    {
      category: '热菜',
      name: '麻婆豆腐',
      description: '麻辣鲜香，下饭首选',
      price: 2800,
      sort: 2,
      isRecommend: false,
      specGroups: [] as string[],
    },
    {
      category: '饮品',
      name: '招牌奶茶',
      description: '可选杯型与加料',
      price: 1200,
      sort: 1,
      isRecommend: true,
      specGroups: ['杯型', '加料'],
    },
  ],
};

async function ensurePlatformAdmin(userRepository: Repository<User>): Promise<void> {
  const username = 'admin';
  const existed = await userRepository.findOne({ where: { username } });
  if (existed) {
    return;
  }

  await userRepository.save(
    userRepository.create({
      merchantId: null,
      storeId: null,
      username,
      password: await hashPassword(SEED_PASSWORD.platformAdmin),
      nickname: '平台管理员',
      phone: null,
      role: Role.PLATFORM_ADMIN,
      status: CommonStatus.ENABLED,
      lastLoginAt: null,
    }),
  );
}

async function ensureDemoTenant(
  merchantRepository: Repository<Merchant>,
  storeRepository: Repository<Store>,
): Promise<{ merchant: Merchant; store: Store }> {
  const merchantName = '示例餐饮（演示）';
  let merchant = await merchantRepository.findOne({ where: { name: merchantName } });
  if (!merchant) {
    merchant = await merchantRepository.save(
      merchantRepository.create({
        name: merchantName,
        contactName: '演示联系人',
        contactPhone: '13800000000',
        status: CommonStatus.ENABLED,
        expireAt: null,
        remark: '由 seed 脚本创建，用于本地联调',
      }),
    );
  }

  const storeName = '人民路店';
  let store = await storeRepository.findOne({
    where: { merchantId: merchant.id, name: storeName },
  });
  if (!store) {
    store = await storeRepository.save(
      storeRepository.create({
        merchantId: merchant.id,
        name: storeName,
        code: 'S001',
        address: '演示市演示区人民路 1 号',
        phone: '0571-88888888',
        status: CommonStatus.ENABLED,
      }),
    );
  }

  return { merchant, store };
}

async function ensureTenantUser(
  userRepository: Repository<User>,
  merchant: Merchant,
  store: Store | null,
  username: string,
  password: string,
  nickname: string,
  role: Role,
): Promise<void> {
  const existed = await userRepository.findOne({ where: { username } });
  if (existed) {
    return;
  }

  await userRepository.save(
    userRepository.create({
      merchantId: merchant.id,
      storeId: store ? store.id : null,
      username,
      password: await hashPassword(password),
      nickname,
      phone: null,
      role,
      status: CommonStatus.ENABLED,
      lastLoginAt: null,
    }),
  );
}

/** 初始化演示菜单：分类 → 规格组（含规格项）→ 菜品 → 菜品-规格组关联 */
async function ensureMenu(dataSource: DataSource, merchant: Merchant): Promise<void> {
  const categoryRepository = dataSource.getRepository(DishCategory);
  const specGroupRepository = dataSource.getRepository(SpecGroup);
  const specOptionRepository = dataSource.getRepository(SpecOption);
  const dishRepository = dataSource.getRepository(Dish);
  const dishSpecGroupRepository = dataSource.getRepository(DishSpecGroup);

  const categoryIdByName = new Map<string, number>();
  for (const item of SEED_MENU.categories) {
    let category = await categoryRepository.findOne({
      where: { merchantId: merchant.id, name: item.name },
    });
    if (!category) {
      category = await categoryRepository.save(
        categoryRepository.create({
          merchantId: merchant.id,
          name: item.name,
          sort: item.sort,
          status: CommonStatus.ENABLED,
        }),
      );
    }
    categoryIdByName.set(item.name, category.id);
  }

  const specGroupIdByName = new Map<string, number>();
  for (const item of SEED_MENU.specGroups) {
    let group = await specGroupRepository.findOne({
      where: { merchantId: merchant.id, name: item.name },
    });
    if (!group) {
      const created = await specGroupRepository.save(
        specGroupRepository.create({
          merchantId: merchant.id,
          name: item.name,
          type: item.type,
          isRequired: item.isRequired,
          sort: item.sort,
          status: CommonStatus.ENABLED,
        }),
      );
      await specOptionRepository.save(
        item.options.map((option) =>
          specOptionRepository.create({
            merchantId: merchant.id,
            groupId: created.id,
            name: option.name,
            priceDiff: option.priceDiff,
            sort: option.sort,
            status: CommonStatus.ENABLED,
          }),
        ),
      );
      group = created;
    }
    specGroupIdByName.set(item.name, group.id);
  }

  for (const item of SEED_MENU.dishes) {
    const categoryId = categoryIdByName.get(item.category);
    if (categoryId === undefined) {
      continue;
    }

    let dish = await dishRepository.findOne({
      where: { merchantId: merchant.id, name: item.name },
    });
    if (!dish) {
      dish = await dishRepository.save(
        dishRepository.create({
          merchantId: merchant.id,
          categoryId,
          name: item.name,
          description: item.description,
          imageUrl: null,
          price: item.price,
          memberPrice: null,
          unit: '份',
          sort: item.sort,
          status: DishStatus.ON_SHELF,
          isRecommend: item.isRecommend,
          soldCount: 0,
        }),
      );
    }

    for (const groupName of item.specGroups) {
      const specGroupId = specGroupIdByName.get(groupName);
      if (specGroupId === undefined) {
        continue;
      }
      const existed = await dishSpecGroupRepository.findOne({
        where: { dishId: dish.id, specGroupId },
      });
      if (!existed) {
        await dishSpecGroupRepository.save(
          dishSpecGroupRepository.create({ dishId: dish.id, specGroupId }),
        );
      }
    }
  }
}

/**
 * 联调用的模拟支付渠道默认密钥。
 * 只在非生产环境写入；生产环境支付配置一律由平台管理员在界面上填写。
 */
const SEED_MOCK_SECRET = 'dev_mock_pay_secret_change_me';

/**
 * 保证模拟支付渠道可用。
 *
 * 四个渠道的配置行由 PaymentConfigService 启动时自动补齐（密文入库），
 * 这里只补一件事：本地联调需要 mock 渠道有一个能验签的密钥。
 * **已存在密钥时绝不覆盖** —— 否则重跑种子会把运营真实填的配置冲掉。
 */
async function ensurePaymentConfigs(
  dataSource: DataSource,
  configService: ConfigService,
  logger: Logger,
): Promise<void> {
  const isProduction = configService.getOrThrow<boolean>('app.isProduction');
  if (isProduction) {
    return;
  }

  const masterKey = configService.getOrThrow<string>('app.configSecret');
  const repository = dataSource.getRepository(PaymentConfig);
  const row = await repository.findOne({ where: { channel: PaymentChannel.MOCK } });
  if (!row) {
    logger.warn('未找到模拟支付渠道配置行，跳过（请确认服务已正常启动过一次）');
    return;
  }

  const settings = decodeSettings(row.settings, masterKey, PAYMENT_CHANNEL_LABELS[PaymentChannel.MOCK]);
  if (settings.secret) {
    return;
  }

  settings.secret = SEED_MOCK_SECRET;
  row.settings = encodeSettings(settings, masterKey);
  row.updatedByName = 'seed';
  await repository.save(row);
  logger.log(`已为模拟支付渠道写入联调密钥（${SEED_MOCK_SECRET}）`);
}

async function run(): Promise<void> {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const merchantRepository = dataSource.getRepository(Merchant);
    const storeRepository = dataSource.getRepository(Store);
    const userRepository = dataSource.getRepository(User);

    await ensurePlatformAdmin(userRepository);

    const { merchant, store } = await ensureDemoTenant(merchantRepository, storeRepository);

    await ensureTenantUser(
      userRepository,
      merchant,
      null,
      'merchant01',
      SEED_PASSWORD.merchantAdmin,
      '商户管理员',
      Role.MERCHANT_ADMIN,
    );
    await ensureTenantUser(
      userRepository,
      merchant,
      store,
      'cashier01',
      SEED_PASSWORD.cashier,
      '收银员',
      Role.CASHIER,
    );

    await ensureMenu(dataSource, merchant);

    await ensurePaymentConfigs(app.get(DataSource), app.get(ConfigService), logger);

    logger.log('种子数据初始化完成，可用账号：');
    logger.log(`  平台管理员  admin      / ${SEED_PASSWORD.platformAdmin}`);
    logger.log(`  商户管理员  merchant01 / ${SEED_PASSWORD.merchantAdmin}`);
    logger.log(`  收银员      cashier01  / ${SEED_PASSWORD.cashier}`);
    logger.log(`  演示商户 ID=${merchant.id}，门店 ID=${store.id}`);
    logger.log(
      `  演示菜单：${SEED_MENU.categories.length} 个分类、${SEED_MENU.specGroups.length} 个规格组、${SEED_MENU.dishes.length} 个菜品`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  const logger = new Logger('Seed');
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
