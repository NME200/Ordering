<script setup lang="ts">
import { computed, ref } from 'vue';
import { Upload } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { UPLOAD_ACCEPT, UPLOAD_MAX_MB, uploadImage } from '../api/upload';

/**
 * 「URL 输入框 + 本地上传」二合一的图片字段。
 *
 * 刻意保留手填地址：现网数据里已有一批 CDN 外链（菜品图就是），
 * 把它们换成上传入口等于逼着人重传一遍；上传只是多给一条路。
 *
 * 上传成功就是把后端返回的地址回填进同一个字段，所以校验、长度限制、
 * 保存链路全都沿用原来的那一份，不为「本地图」造第二套数据形状。
 */
const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  /** 输入框下方的一行小字，用来写「留空会怎样」 */
  hint?: string;
}>();

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const fileRef = ref<HTMLInputElement>();
const busy = ref(false);

/** el-input 不直接改 props，走 emit，保证 v-model 在父组件里仍是唯一真值 */
const url = computed({
  get: () => props.modelValue ?? '',
  set: (value: string) => emit('update:modelValue', value),
});

function openPicker(): void {
  fileRef.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 立刻清空，否则「选同一张图再传一次」浏览器不会触发 change
  input.value = '';
  if (!file) {
    return;
  }
  const maxBytes = UPLOAD_MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    ElMessage.warning(
      `图片 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 ${UPLOAD_MAX_MB}MB 上限，先压缩一下`,
    );
    return;
  }

  busy.value = true;
  try {
    const result = await uploadImage(file);
    url.value = result.url;
    ElMessage.success('图片已上传，记得点保存');
  } catch {
    // 类型不符、超限、没登录这些后端已经给了一句话，请求层弹过了
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="image-field">
    <div class="image-field__row">
      <el-input
        v-model="url"
        class="image-field__input"
        :placeholder="placeholder ?? '图片地址，或点右侧按钮上传本地图片'"
        clearable
      />
      <el-button :icon="Upload" :loading="busy" @click="openPicker">
        {{ busy ? '上传中' : '上传图片' }}
      </el-button>
      <input
        ref="fileRef"
        class="image-field__file"
        type="file"
        :accept="UPLOAD_ACCEPT"
        @change="onFileChange"
      />
    </div>

    <div v-if="url" class="image-field__preview">
      <el-image class="image-field__thumb" :src="url" fit="cover" :preview-src-list="[url]" preview-teleported>
        <template #error>
          <span class="image-field__broken">读不到这张图</span>
        </template>
      </el-image>
      <el-button link type="primary" @click="url = ''">清除图片</el-button>
      <span v-if="hint" class="image-field__hint">{{ hint }}</span>
    </div>
    <p v-else-if="hint" class="image-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped lang="scss">
.image-field {
  width: 100%;
}

.image-field__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-field__input {
  flex: 1;
  min-width: 0;
}

/* 原生 file input 只当触发器用，不参与布局 */
.image-field__file {
  display: none;
}

.image-field__preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.image-field__thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 6px;
  background-color: var(--neutral-100);
}

.image-field__broken {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 11px;
  color: var(--neutral-500);
}

.image-field__hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--neutral-500);
}
</style>
