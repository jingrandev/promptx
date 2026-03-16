<script setup>
import { Check, LoaderCircle } from 'lucide-vue-next'
import WorkbenchSelect from './WorkbenchSelect.vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  sessions: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'refresh-intent'])

function getSessionTitle(session) {
  return session?.title || '未命名会话'
}

function getSessionCwd(session) {
  return session?.cwd || '未设置路径'
}

function getRuntimeStatusLabel(session) {
  return session?.running ? '运行中' : '空闲'
}

function getRuntimeStatusClass(session) {
  return session?.running
    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-[#7f6949] dark:bg-[#392f20] dark:text-[#e5ce9a]'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-[#5b7562] dark:bg-[#243228] dark:text-[#deecdf]'
}
</script>

<template>
  <WorkbenchSelect
    :model-value="modelValue"
    :options="sessions"
    :loading="loading"
    :disabled="disabled"
    placeholder="请选择 PromptX 会话"
    empty-text="还没有会话，请先到管理弹窗里新建。"
    :get-option-value="(session) => session?.id || ''"
    @update:model-value="emit('update:modelValue', $event)"
    @refresh-intent="emit('refresh-intent')"
  >
    <template #trigger="{ selectedOption }">
      <template v-if="selectedOption">
        <div class="flex items-center gap-2 text-sm">
          <span class="min-w-0 flex-1 truncate font-medium text-stone-900 dark:text-stone-100">
            {{ getSessionTitle(selectedOption) }} - {{ getSessionCwd(selectedOption) }}
          </span>
          <span class="inline-flex items-center rounded-sm border border-dashed px-1.5 py-0.5 text-[10px]" :class="getRuntimeStatusClass(selectedOption)">
            {{ getRuntimeStatusLabel(selectedOption) }}
          </span>
        </div>
      </template>
      <template v-else>
        <div class="text-sm text-stone-500 dark:text-stone-400">
          {{ loading ? '正在同步会话...' : '请选择 PromptX 会话' }}
        </div>
      </template>
    </template>

    <template #header>
      <div class="flex items-center justify-between gap-3 border-b border-dashed border-stone-300 px-3 py-2 text-[11px] text-stone-500 dark:border-[#544941] dark:text-stone-400">
        <span>{{ loading ? '正在同步最新会话...' : `共 ${sessions.length} 个会话` }}</span>
        <LoaderCircle v-if="loading" class="h-3.5 w-3.5 animate-spin" />
      </div>
    </template>

    <template #option="{ option, selected, select }">
      <button
        type="button"
        class="w-full rounded-sm border border-dashed p-3 text-left transition"
        :class="selected
          ? 'border-stone-500 bg-stone-50 dark:border-[#73665c] dark:bg-[#332c27]'
          : 'border-stone-300 bg-white hover:border-stone-500 dark:border-[#453c36] dark:bg-[#26211d] dark:hover:border-[#73665c]'"
        @click="select"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-sm">
              <span class="min-w-0 flex-1 truncate font-medium text-stone-900 dark:text-stone-100">
                {{ getSessionTitle(option) }} - {{ getSessionCwd(option) }}
              </span>
              <span class="inline-flex items-center rounded-sm border border-dashed px-1.5 py-0.5 text-[10px]" :class="getRuntimeStatusClass(option)">
                {{ getRuntimeStatusLabel(option) }}
              </span>
            </div>
          </div>

          <Check
            v-if="selected"
            class="mt-0.5 h-4 w-4 shrink-0 text-stone-700 dark:text-stone-200"
          />
        </div>
      </button>
    </template>
  </WorkbenchSelect>
</template>
