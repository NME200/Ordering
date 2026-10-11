<script setup lang="ts">
import { computed } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import IconPicker from './IconPicker.vue';
import LineIcon from './LineIcon.vue';
import type { LayoutSection, PreviewData } from '../../types/app-config';
import {
  APP_LINKS,
  ASSET_KEYS,
  BENEFIT_KEYS,
  COUPON_TAB_KEYS,
  ENUM_ITEM_DEFAULTS,
  ENUM_LABELS,
  ORDER_ENTRY_KEYS,
  SECTION_ITEM_DEFAULTS,
  SECTION_META,
  SERVICE_ENTRY_KEYS,
} from '../../types/app-config';

/**
 * 选中组件的属性配置（11.2 右侧那栏）。
 *
 * 字段直接绑在 `section.props` 上 —— 那是画布里那份真实对象，改一个字符预览就跟着变。
 * 服务端会按组件 key 再校验一遍白名单字段，所以面板放出去的字段不会变成脏数据。
 */
const props = defineProps<{
  section: LayoutSection;
  preview: PreviewData;
  readonly: boolean;
}>();

const emit = defineEmits<{ remove: [] }>();

const label = computed(() => SECTION_META[props.section.key]?.label ?? props.section.key);
const glyph = computed(() => SECTION_META[props.section.key]?.icon ?? 'store');

/** 每个键的可选项清单：入口项的 key 是闭合枚举，不让运营自由填 */
const ENUM_KEYS: Record<string, readonly string[]> = {
  assetBar: ASSET_KEYS,
  orderEntry: ORDER_ENTRY_KEYS,
  serviceGrid: SERVICE_ENTRY_KEYS,
  benefitGrid: BENEFIT_KEYS,
  couponTabs: COUPON_TAB_KEYS,
};

const LINKED_KEYS = ['entryGrid', 'orderEntry', 'serviceGrid', 'taskList', 'couponEntry', 'searchBar'];
const ICONED_KEYS = ['entryGrid', 'notice', 'couponEntry', 'orderEntry', 'serviceGrid', 'benefitGrid'];

const enumOptions = computed(() => ENUM_KEYS[props.section.key] ?? []);
const showKeySelect = computed(() => enumOptions.value.length > 0);
const showLink = computed(() => LINKED_KEYS.includes(props.section.key));
const showIcon = computed(() => ICONED_KEYS.includes(props.section.key));
const isGradient = computed(() => ['userHeader', 'memberCard'].includes(props.section.key));
const isSimple = computed(() => ['notice', 'searchBar', 'ruleEntry', 'footerButton'].includes(props.section.key));
const isShopLike = computed(() => ['shopList', 'couponEntry'].includes(props.section.key));
const isCouponList = computed(() => props.section.key === 'couponList');

const itemLimit = computed(() => {
  const key = props.section.key;
  if (key === 'orderEntry' || key === 'couponTabs') return 4;
  if (key === 'assetBar') return 3;
  if (key === 'benefitGrid') return 8;
  if (key === 'taskList') return 6;
  return 12;
});

const rows = computed(() => props.section.props.items ?? []);

/**
 * 加一项：一次只加一个，且**按组件给合法的字段形状**。
 *
 * 资产栏只有 `key + label`、券页签只有 `key + text`、权益项不许有 `link` ——
 * 多塞一个键就被后端的 `forbidNonWhitelisted` 整条拒掉，表现成「点了添加就存不下去」。
 */
function addItem(): void {
  const key = props.section.key;
  const list = [...rows.value];
  const candidates = ENUM_KEYS[key] ?? [];

  if (candidates.length > 0) {
    const used = new Set(list.map((row) => row.key));
    const next = candidates.find((item) => !used.has(item));
    if (!next) {
      ElMessage.info('这一类可选项已经全部加进来了');
      return;
    }
    const text = ENUM_LABELS[next] ?? next;
    const preset = ENUM_ITEM_DEFAULTS[key]?.[next] ?? {};
    list.push(key === 'assetBar' ? { key: next, label: text, ...preset } : { key: next, text, ...preset });
  } else {
    list.push((SECTION_ITEM_DEFAULTS[key] ?? SECTION_ITEM_DEFAULTS.entryGrid)());
  }
  props.section.props.items = list;
}

function removeItem(index: number): void {
  const list = [...rows.value];
  list.splice(index, 1);
  props.section.props.items = list;
}

function moveItem(index: number, delta: number): void {
  const list = [...rows.value];
  const to = index + delta;
  if (to < 0 || to >= list.length) {
    return;
  }
  const [moved] = list.splice(index, 1);
  list.splice(to, 0, moved);
  props.section.props.items = list;
}

function addImage(): void {
  const list = props.section.props.images ?? [];
  if (list.length >= 5) {
    return;
  }
  props.section.props.images = [...list, { url: '', link: '' }];
}

function removeImage(index: number): void {
  const list = [...(props.section.props.images ?? [])];
  list.splice(index, 1);
  props.section.props.images = list;
}

/** 渐变两色：Element 的颜色选择器绑数组下标不方便，这里给一对读写 */
function gradientColor(index: number): string {
  return props.section.props.bgColors?.[index] ?? '';
}

function setGradientColor(index: number, value: string | null): void {
  const colors = [...(props.section.props.bgColors ?? ['', ''])];
  colors[index] = value ?? '';
  props.section.props.bgColors = colors;
}

</script>

<template>
  <div class="form">
    <h3 class="form__title">
      <LineIcon :name="glyph" :size="18" color="#c8752b" />
      {{ label }}
      <span class="form__sub">属性配置</span>
    </h3>

    <el-form label-position="top" :disabled="readonly">
      <!-- 品牌轮播 -->
      <template v-if="section.key === 'banner'">
        <el-form-item label="轮播图片（最多 5 张）">
          <div class="stack">
            <div v-for="(row, rowIndex) in section.props.images ?? []" :key="rowIndex" class="image">
              <span class="image__idx num">{{ rowIndex + 1 }}</span>
              <el-input v-model="row.url" placeholder="图片地址，https: 开头" />
              <el-select v-model="row.link" placeholder="选择链接" clearable>
                <el-option v-for="item in APP_LINKS" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-button :icon="Delete" link type="danger" @click="removeImage(rowIndex)" />
            </div>
            <el-button :icon="Plus" plain size="small" :disabled="readonly || (section.props.images ?? []).length >= 5" @click="addImage">
              添加图片
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="高度（px）">
          <el-slider v-model="section.props.height" :min="120" :max="400" show-input size="small" />
        </el-form-item>
        <el-form-item label="圆角（px）">
          <el-slider v-model="section.props.radius" :min="0" :max="24" show-input size="small" />
        </el-form-item>
        <el-form-item label="指示点颜色 / 切换间隔">
          <el-color-picker v-model="section.props.indicatorColor" size="small" />
          <el-input-number v-model="section.props.interval" :min="1000" :max="10000" :step="500" size="small" controls-position="right" />
        </el-form-item>
      </template>

      <!-- 公告 / 搜索 / 规则 / 底部按钮 -->
      <template v-else-if="isSimple">
        <el-form-item v-if="section.key === 'notice'" label="公告文字">
          <el-input v-model="section.props.text" type="textarea" :rows="2" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'searchBar'" label="占位文案">
          <el-input v-model="section.props.placeholder" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'footerButton'" label="未开通文案">
          <el-input v-model="section.props.text" maxlength="12" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'footerButton'" label="已开通文案">
          <el-input v-model="section.props.openedText" maxlength="12" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'ruleEntry'" label="入口文案">
          <el-input v-model="section.props.text" maxlength="8" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'notice'" label="底色 / 文字色">
          <el-color-picker v-model="section.props.bgColor" size="small" />
          <el-color-picker v-model="section.props.textColor" size="small" />
        </el-form-item>
        <el-form-item v-if="section.key === 'notice'" label="图标">
          <IconPicker v-model="section.props.icon" :disabled="readonly" />
        </el-form-item>
        <el-form-item v-if="section.key !== 'ruleEntry'" label="跳转链接">
          <el-select v-model="section.props.link" placeholder="不跳转" clearable>
            <el-option v-for="item in APP_LINKS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 门店列表 / 领券入口 -->
      <template v-else-if="isShopLike">
        <el-form-item v-if="section.key === 'shopList'" label="标题">
          <el-input v-model="section.props.title" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'shopList'" label="排序">
          <el-radio-group v-model="section.props.sortMode">
            <el-radio value="distance">距离最近</el-radio>
            <el-radio value="sales">月售最高</el-radio>
          </el-radio-group>
          <p class="form__note">没有「评分最高」：后端还没有评价表，排序维度不能凭空出现。</p>
        </el-form-item>
        <el-form-item v-if="section.key === 'shopList'" label="显示条数 / 显示距离">
          <el-input-number v-model="section.props.limit" :min="1" :max="20" size="small" controls-position="right" />
          <el-switch v-model="section.props.showDistance" />
        </el-form-item>
        <el-form-item v-if="section.key === 'couponEntry'" label="标题">
          <el-input v-model="section.props.title" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'couponEntry'" label="利益点文案">
          <el-input v-model="section.props.benefit" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'couponEntry'" label="图标">
          <IconPicker v-model="section.props.icon" :disabled="readonly" />
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-select v-model="section.props.link" placeholder="不跳转" clearable>
            <el-option v-for="item in APP_LINKS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </template>

      <!-- 渐变背景：用户头部 / 会员卡面 -->
      <template v-else-if="isGradient">
        <el-form-item v-if="section.key === 'memberCard'" label="品牌名">
          <el-input v-model="section.props.brandName" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item v-if="section.key === 'memberCard'" label="等级名称">
          <el-input v-model="section.props.levelName" maxlength="12" show-word-limit />
        </el-form-item>
        <el-form-item label="背景">
          <el-radio-group v-model="section.props.bgType">
            <el-radio value="gradient">渐变</el-radio>
            <el-radio value="image">图片</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="section.props.bgType !== 'image'" label="渐变两色">
          <el-color-picker :model-value="gradientColor(0)" size="small" @update:model-value="setGradientColor(0, $event as string)" />
          <el-color-picker :model-value="gradientColor(1)" size="small" @update:model-value="setGradientColor(1, $event as string)" />
        </el-form-item>
        <el-form-item v-else label="背景图地址">
          <el-input v-model="section.props.bgImage" placeholder="https://…" clearable />
        </el-form-item>
        <el-form-item v-if="section.key === 'userHeader'" label="显示 ID">
          <el-switch v-model="section.props.showId" />
        </el-form-item>
        <el-form-item v-if="section.key === 'userHeader'" label="绑定手机号提示">
          <el-input v-model="section.props.bindPhoneTip" maxlength="30" show-word-limit />
        </el-form-item>
        <template v-if="section.key === 'memberCard'">
          <el-form-item label="显示卡号 / 成长值">
            <el-switch v-model="section.props.showCardNo" />
            <el-switch v-model="section.props.showGrowth" />
          </el-form-item>
          <p class="form__note">关掉只是不画：成长值本身是账号数据，不由装修决定。</p>
        </template>
      </template>

      <!-- 券列表 -->
      <template v-else-if="isCouponList">
        <el-form-item label="券面样式">
          <el-radio-group v-model="section.props.cardStyle">
            <el-radio value="ticket">票根</el-radio>
            <el-radio value="plain">简约</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="显示门店名 / 有效期">
          <el-switch v-model="section.props.showShopName" />
          <el-switch v-model="section.props.showExpire" />
        </el-form-item>
        <el-form-item label="按钮文案（可用 / 失效）">
          <el-input v-model="section.props.btnText" maxlength="6" show-word-limit />
          <el-input v-model="section.props.expiredBtnText" maxlength="6" show-word-limit />
        </el-form-item>
        <el-form-item label="空状态文案">
          <el-input v-model="section.props.emptyText" maxlength="10" show-word-limit />
        </el-form-item>
        <p class="form__note">券的面额、门槛、有效期来自营销接口，这里只决定长什么样。</p>
      </template>

      <!-- 其余组件统一是「列表项」形态 -->
      <template v-else>
        <el-form-item v-if="!['assetBar', 'couponTabs'].includes(section.key)" label="标题">
          <el-input v-model="section.props.title" maxlength="16" show-word-limit />
        </el-form-item>
        <el-form-item v-if="['entryGrid', 'serviceGrid', 'benefitGrid'].includes(section.key)" label="每行个数">
          <el-radio-group v-model="section.props.cols">
            <el-radio
              v-for="n in section.key === 'entryGrid' ? [1, 2, 3, 4, 5] : section.key === 'benefitGrid' ? [2, 3, 4] : [3, 4]"
              :key="n"
              :value="n"
            >
              {{ n }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="section.key === 'couponTabs'" label="默认停在第几个页签">
          <el-input-number v-model="section.props.defaultIndex" :min="0" :max="2" size="small" controls-position="right" />
        </el-form-item>

        <el-form-item :label="`列表项（最多 ${itemLimit} 个，顺序就是从左到右）`">
          <div class="stack">
            <div v-for="(row, index) in rows" :key="index" class="item">
              <div class="item__head">
                <span class="item__idx num">{{ index + 1 }}</span>
                <div class="item__moves">
                  <button type="button" :disabled="readonly || index === 0" @click="moveItem(index, -1)">↑</button>
                  <button type="button" :disabled="readonly || index === rows.length - 1" @click="moveItem(index, 1)">↓</button>
                </div>
                <el-button :icon="Delete" link type="danger" :disabled="readonly" @click="removeItem(index)" />
              </div>

              <el-select v-if="showKeySelect" v-model="row.key" placeholder="项目">
                <el-option v-for="key in enumOptions" :key="key" :label="ENUM_LABELS[key] ?? key" :value="key" />
              </el-select>

              <div class="item__row">
                <span v-if="showIcon" class="item__icon">
                  <IconPicker v-model="row.icon" :disabled="readonly" />
                </span>
                <el-input v-if="section.key !== 'assetBar'" v-model="row.text" :maxlength="section.key === 'taskList' ? 20 : 8" placeholder="文案" />
                <el-input v-else v-model="row.label" maxlength="6" placeholder="资产名" />
              </div>

              <el-input v-if="section.key === 'taskList'" v-model="row.btnText" maxlength="6" placeholder="按钮文案" />
              <el-select v-if="showLink" v-model="row.link" placeholder="选择链接" clearable>
                <el-option v-for="link in APP_LINKS" :key="link.value" :label="link.label" :value="link.value" />
              </el-select>
              <el-input v-if="section.key === 'entryGrid'" v-model="row.badge" maxlength="6" placeholder="角标（选填）" />
              <el-form-item v-if="section.key === 'serviceGrid'" label="是否显示">
                <el-switch v-model="row.enabled" />
              </el-form-item>
            </div>

            <el-button
              :icon="Plus"
              plain
              size="small"
              :disabled="readonly || rows.length >= itemLimit || (showKeySelect && rows.length >= enumOptions.length)"
              @click="addItem"
            >
              添加一项
            </el-button>
            <p v-if="!rows.length" class="form__note">一个都没配 —— 这一栏现在不会显示给顾客。</p>
          </div>
        </el-form-item>

        <p v-if="section.key === 'entryGrid'" class="form__note">
          「唤起扫码」是保留动作，顾客扫桌码后直接带出门店。外卖那一格只改标题与跳转，
          不含配送费与起送价 —— 后端还没有配送模型。
        </p>
        <p v-else-if="section.key === 'serviceGrid'" class="form__note">
          可选入口是闭合的：每个键都对应小程序里真存在的页面，加新入口要先发小程序版本。
        </p>
      </template>
    </el-form>

    <div class="form__foot">
      <el-button link type="danger" :disabled="readonly" @click="emit('remove')">删除组件</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.form {
  padding: var(--space-3) var(--space-4) 0;

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 var(--space-3);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--brand-600);
  }

  &__sub {
    font-weight: 400;
    font-size: 12px;
    color: var(--text-placeholder);
  }

  &__note {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-placeholder);
  }

  &__foot {
    padding: var(--space-2) 0 var(--space-3);
    border-top: 1px solid var(--neutral-100);
    text-align: center;
  }
}

.stack {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image {
  display: flex;
  align-items: center;
  gap: 6px;

  &__idx {
    width: 14px;
    font-size: 11px;
    color: var(--text-placeholder);
  }

  :deep(.el-select) {
    width: 118px;
    flex: none;
  }
}

.item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  background-color: var(--surface);

  &__head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__idx {
    font-size: 11px;
    color: var(--text-placeholder);
  }

  &__moves {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }

  &__moves button {
    width: 22px;
    height: 20px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background-color: var(--surface);
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  &__moves button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__icon {
    flex: none;
    width: 108px;
  }
}
</style>
