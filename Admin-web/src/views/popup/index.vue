<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@shared/components/PageHeader.vue';
import { useUserStore } from '@/store/modules/user';
import { Permission } from '@shared/types/enums';
import { formatDateTime } from '@shared/utils/format';
import { fetchStores } from '@shared/api/store';
import type { Store } from '@shared/types/store';
import { createPopup, fetchPopups, removePopup, updatePopup } from '@/api/popup';
import {
  APP_LINKS,
  POPUP_FREQUENCY_LABELS,
  POPUP_QUEUE_LABELS,
  POPUP_SCENE_LABELS,
  POPUP_TYPE_LABELS,
} from '@/types/app-config';
import type {
  Popup,
  PopupContent,
  PopupFrequency,
  PopupScene,
  PopupType,
  SavePopupPayload,
} from '@/types/app-config';

/**
 * 平台管理端 · 活动弹窗。
 *
 * 弹窗与布局装修是两套东西：它有生效周期、频次、优先级与曝光统计，
 * 生命周期跟「页面组件」完全不同，所以独立一屏（见 Small-web/doc/popup-design.md）。
 *
 * 队列语义在**优先级最高的那条**上定：它说 top_only 就只弹它，它说 maxShow=2 就最多两个。
 * 频次由小程序本地拦截、show_log 留痕，这里的数据列就是那份权威统计。
 */
const userStore = useUserStore();
const canWrite = computed(() => userStore.hasPermission(Permission.POPUP_UPDATE));

const loading = ref(false);
const rows = ref<Popup[]>([]);
const stores = ref<Store[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await fetchPopups();
  } finally {
    loading.value = false;
  }
}

async function loadStores(): Promise<void> {
  try {
    const page = await fetchStores({ page: 1, pageSize: 100 });
    stores.value = page.list;
  } catch {
    stores.value = [];
  }
}

/* ---------------- 编辑抽屉 ---------------- */

const editorOpen = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);

const form = reactive<SavePopupPayload>({
  name: '',
  type: 'image',
  scene: 'home',
  storeId: null,
  priority: 10,
  status: 1,
  startTime: null,
  endTime: null,
  frequency: 'daily',
  maxShow: 1,
  queueMode: 'queue',
  content: { image: '', link: '', closeStyle: 'top-right', maskAlpha: 0.6 },
});

/** 生效时间用区间控件读写，提交时再拆回两个字段 */
const window = computed({
  get: (): [string, string] | null =>
    form.startTime && form.endTime ? [form.startTime, form.endTime] : null,
  set: (value: [string, string] | null) => {
    form.startTime = value?.[0] ?? null;
    form.endTime = value?.[1] ?? null;
  },
});

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, {
    name: '',
    type: 'image',
    scene: 'home',
    storeId: null,
    priority: 10,
    status: 1,
    startTime: null,
    endTime: null,
    frequency: 'daily',
    maxShow: 1,
    queueMode: 'queue',
    content: { image: '', link: '', closeStyle: 'top-right', maskAlpha: 0.6 },
  });
  editorOpen.value = true;
}

function openEdit(row: Popup): void {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    type: row.type,
    scene: row.scene,
    storeId: row.storeId,
    priority: row.priority,
    status: row.status,
    startTime: row.startTime,
    endTime: row.endTime,
    frequency: row.frequency,
    maxShow: row.maxShow,
    queueMode: row.queueMode,
    content: { ...row.content },
  });
  editorOpen.value = true;
}

/**
 * 提交前按类型只留属于它的内容字段。
 *
 * 表单里两套控件共用同一个 `content` 对象（切类型不用重填），但后端是按 `type`
 * 分派到各自的校验类并**禁止未声明字段**，于是公告型带上 image/link 就会得到
 * 「内容：property link should not exist」这一串。空串也一并丢掉：
 * `link: ''` 会被当成非法跳转地址，而不是「不跳转」。
 */
const CONTENT_KEYS: Record<PopupType, string[]> = {
  image: ['image', 'link', 'closeStyle', 'maskAlpha', 'width', 'height'],
  notice: ['title', 'text', 'btnText', 'titleColor'],
};

function pickContent(type: PopupType, content: PopupContent): PopupContent {
  const bag = content as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of CONTENT_KEYS[type]) {
    const value = bag[key];
    if (value !== undefined && value !== null && value !== '') picked[key] = value;
  }
  return picked as PopupContent;
}

/** 两类各自的必填项：界面标了 required，这里给一句人话，比后端的「must be a string」有用 */
function missingRequired(type: PopupType, content: PopupContent): string {
  const filled = (value: unknown) => String(value ?? '').trim() !== '';
  if (type === 'image') return filled(content.image) ? '' : '活动图地址';
  if (!filled(content.title)) return '标题';
  if (!filled(content.text)) return '正文';
  return '';
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('给这个弹窗起个名字，列表里认得出来');
    return;
  }
  const missing = missingRequired(form.type, form.content);
  if (missing) {
    ElMessage.warning(`还差「${missing}」没填`);
    return;
  }
  saving.value = true;
  try {
    const payload: SavePopupPayload = {
      ...form,
      name: form.name.trim(),
      content: pickContent(form.type, form.content),
    };
    const saved = editingId.value === null
      ? await createPopup(payload)
      : await updatePopup(editingId.value, payload);
    ElMessage.success(editingId.value === null ? '弹窗已创建' : '弹窗已更新');
    editorOpen.value = false;
    editingId.value = saved.id;
    await load();
  } catch {
    // 内容校验的具体缺失项已由请求层弹出
  } finally {
    saving.value = false;
  }
}

async function toggle(row: Popup, enabled: boolean): Promise<void> {
  try {
    await updatePopup(row.id, {
      name: row.name,
      type: row.type,
      scene: row.scene,
      storeId: row.storeId,
      priority: row.priority,
      status: enabled ? 1 : 0,
      startTime: row.startTime,
      endTime: row.endTime,
      frequency: row.frequency,
      maxShow: row.maxShow,
      queueMode: row.queueMode,
      content: row.content,
    });
    ElMessage.success(enabled ? '已启用' : '已停用');
  } catch {
    // 失败时把开关拨回去，别让界面显示一个没落库的状态
  } finally {
    await load();
  }
}

async function remove(row: Popup): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？已发生的曝光记录会保留。`,
      '删除弹窗',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  await removePopup(row.id);
  ElMessage.success('弹窗已删除');
  await load();
}

function storeName(id: number | null): string {
  if (id === null) {
    return '全平台';
  }
  return stores.value.find((item) => item.id === id)?.name ?? `门店 ${id}`;
}

function rate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

onMounted(async () => {
  await Promise.all([load(), loadStores()]);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="活动弹窗"
      description="顾客在冷启动 / 进首页 / 进店 / 支付成功时被弹出的活动位。同一时刻只弹一个，关掉才弹下一个；顾客点过之后不再打扰"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新建弹窗</el-button>
      </template>
    </PageHeader>

    <el-table v-loading="loading" :data="rows" class="table" row-key="id">
      <el-table-column label="优先级" width="80" prop="priority" />
      <el-table-column label="名称" min-width="150" prop="name" show-overflow-tooltip />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">{{ POPUP_TYPE_LABELS[row.type as PopupType] }}</template>
      </el-table-column>
      <el-table-column label="触发场景" width="110">
        <template #default="{ row }">{{ POPUP_SCENE_LABELS[row.scene as PopupScene] }}</template>
      </el-table-column>
      <el-table-column label="投放范围" width="130">
        <template #default="{ row }">{{ storeName(row.storeId) }}</template>
      </el-table-column>
      <el-table-column label="生效期" min-width="180">
        <template #default="{ row }">
          <span v-if="row.startTime || row.endTime">
            {{ row.startTime ? formatDateTime(row.startTime) : '不限' }} ~
            {{ row.endTime ? formatDateTime(row.endTime) : '不限' }}
          </span>
          <span v-else>长期有效</span>
        </template>
      </el-table-column>
      <el-table-column label="频次" width="110">
        <template #default="{ row }">{{ POPUP_FREQUENCY_LABELS[row.frequency as PopupFrequency] }}</template>
      </el-table-column>
      <el-table-column label="曝光" width="120">
        <template #default="{ row }">
          <span class="num">{{ row.stats.exposureUv }}</span>
          <span class="muted">人 / {{ row.stats.exposurePv }} 次</span>
        </template>
      </el-table-column>
      <el-table-column label="点击率" width="100">
        <template #default="{ row }">
          <span class="num">{{ rate(row.stats.clickRate) }}</span>
          <span class="muted">（{{ row.stats.clickUv }} 人）</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="row.status === 1"
            :disabled="!canWrite"
            @update:model-value="toggle(row as Popup, $event as boolean)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button :icon="Edit" link type="primary" :disabled="!canWrite" @click="openEdit(row as Popup)">
            编辑
          </el-button>
          <el-button :icon="Delete" link type="danger" :disabled="!canWrite" @click="remove(row as Popup)">
            删除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <p class="empty">还没有活动弹窗。新建一个图文弹窗，配上活动图与跳转页即可投放。</p>
      </template>
    </el-table>

    <el-dialog v-model="editorOpen" :title="editingId === null ? '新建弹窗' : '编辑弹窗'" width="720px">
      <el-form label-width="110px" :model="form">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="后台认得出来就行，如「秋季新品」" />
        </el-form-item>

        <el-form-item label="类型" required>
          <el-radio-group v-model="form.type">
            <el-radio value="image">图文弹窗</el-radio>
            <el-radio value="notice">公告弹窗</el-radio>
          </el-radio-group>
          <p class="tip">
            领券型 / 报名型要等券模板与顾客账号落地才做得真 —— 那时才会加进类型清单，
            现在放进来只会弹一个点不动的按钮。
          </p>
        </el-form-item>

        <el-form-item label="触发场景">
          <el-select v-model="form.scene">
            <el-option
              v-for="(label, key) in POPUP_SCENE_LABELS"
              :key="key"
              :label="`${label}（${key}）`"
              :value="key"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="投放范围">
          <el-select v-model="form.storeId" placeholder="全平台通用" clearable>
            <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="1" :max="999" controls-position="right" />
          <span class="tip inline">数字越小越先弹</span>
        </el-form-item>

        <el-form-item label="生效期">
          <el-date-picker
            v-model="window"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss.000Z"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </el-form-item>

        <el-form-item label="频次">
          <el-radio-group v-model="form.frequency">
            <el-radio value="once">只弹一次</el-radio>
            <el-radio value="daily">每天一次</el-radio>
            <el-radio value="always">每次触发都弹</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="多弹窗方式">
          <el-select v-model="form.queueMode">
            <el-option
              v-for="(label, key) in POPUP_QUEUE_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
          <el-input-number v-model="form.maxShow" :min="1" :max="5" controls-position="right" />
          <span class="tip inline">本条排在最前时，一次最多弹几个</span>
        </el-form-item>

        <template v-if="form.type === 'image'">
          <el-form-item label="活动图地址" required>
            <el-input v-model="form.content.image" placeholder="https://… 建议 750×900、200KB 以内" />
          </el-form-item>
          <el-form-item label="点击跳转">
            <el-select v-model="form.content.link" placeholder="不跳转" clearable>
              <el-option v-for="item in APP_LINKS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="关闭样式">
            <el-radio-group v-model="form.content.closeStyle">
              <el-radio value="top-right">图下方圆形关闭</el-radio>
              <el-radio value="bottom-text">图下方「跳过」</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="遮罩浓度">
            <el-slider v-model="form.content.maskAlpha" :min="0" :max="1" :step="0.05" show-input size="small" />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="标题" required>
            <el-input v-model="form.content.title" maxlength="30" show-word-limit />
          </el-form-item>
          <el-form-item label="正文" required>
            <el-input v-model="form.content.text" type="textarea" :rows="3" maxlength="200" show-word-limit />
          </el-form-item>
          <el-form-item label="按钮文案">
            <el-input v-model="form.content.btnText" maxlength="12" placeholder="默认「我知道了」" />
          </el-form-item>
        </template>

        <el-form-item label="启用">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.muted {
  margin-left: 4px;
  font-size: 11.5px;
  color: var(--text-placeholder);
}

.empty {
  margin: 0;
  padding: var(--space-5) 0;
  font-size: 12.5px;
  color: var(--text-placeholder);
}

.tip {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-placeholder);

  &.inline {
    margin-left: 8px;
  }
}
</style>
