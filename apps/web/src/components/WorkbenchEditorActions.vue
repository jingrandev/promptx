<script setup>
import { computed } from 'vue'
import { LoaderCircle, List, Plus, SendHorizontal, Upload, WandSparkles } from 'lucide-vue-next'
import { useI18n } from '../composables/useI18n.js'
import { formatAgentBindingLabel } from '../lib/agentEngines.js'

const props = defineProps({
  agentBindings: {
    type: Array,
    default: () => [],
  },
  selectedAgentEngine: {
    type: String,
    default: '',
  },
  canAddTodo: {
    type: Boolean,
    default: false,
  },
  uploading: {
    type: Boolean,
    default: false,
  },
  isCurrentTaskSending: {
    type: Boolean,
    default: false,
  },
  sendState: {
    type: String,
    default: 'idle',
  },
  todoCount: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'add-todo',
  'open-file-picker',
  'clear-request',
  'copy-request',
  'manage-todo',
  'send-request',
  'update:selectedAgentEngine',
])

const { t } = useI18n()

const sendBusy = computed(() => props.sendState === 'sending' || props.sendState === 'running')
const agentOptions = computed(() => {
  const seen = new Set()
  return (Array.isArray(props.agentBindings) ? props.agentBindings : []).filter((item) => {
    const engine = String(item?.engine || '').trim()
    if (!engine || seen.has(engine)) {
      return false
    }
    seen.add(engine)
    return true
  })
})
const showAgentSelector = computed(() => agentOptions.value.length > 1)
const selectedAgentEngineValue = computed(() => {
  const selected = String(props.selectedAgentEngine || '').trim()
  if (agentOptions.value.some((item) => item.engine === selected)) {
    return selected
  }
  return agentOptions.value.find((item) => item.isDefault)?.engine || agentOptions.value[0]?.engine || ''
})

function getTodoManageLabel() {
  return props.todoCount > 0 ? t('editor.todoWithCount', { count: props.todoCount }) : t('editor.todo')
}

function getAgentOptionLabel(item = {}) {
  return formatAgentBindingLabel(item, {
    prefix: '→ ',
    defaultLabel: t('sessionPanel.defaultAgent'),
  })
}
</script>

<template>
  <div
    class="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2"
    data-promptx-editor-actions
  >
    <div class="grid w-full grid-cols-5 gap-1.5 sm:flex sm:w-full sm:flex-wrap sm:justify-end sm:gap-2">
      <button
        type="button"
        class="tool-button inline-flex min-w-0 items-center justify-center gap-1.5 px-0 py-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
        :disabled="uploading"
        :title="t('editor.chooseFiles')"
        :aria-label="t('editor.chooseFiles')"
        data-promptx-editor-action="files"
        @mousedown.prevent
        @click="emit('open-file-picker')"
      >
        <LoaderCircle v-if="uploading" class="h-4 w-4 animate-spin" />
        <Upload v-else class="h-4 w-4" />
        <span class="sr-only sm:not-sr-only sm:inline">{{ t('editor.chooseFiles') }}</span>
      </button>
      <button
        type="button"
        class="tool-button inline-flex min-w-0 items-center justify-center gap-1.5 px-0 py-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
        :title="t('editor.clear')"
        :aria-label="t('editor.clear')"
        data-promptx-editor-action="clear"
        @mousedown.prevent
        @click="emit('clear-request')"
      >
        <WandSparkles class="h-4 w-4" />
        <span class="sr-only sm:not-sr-only sm:inline">{{ t('editor.clear') }}</span>
      </button>
      <button
        type="button"
        class="tool-button inline-flex min-w-0 items-center justify-center gap-1.5 px-0 py-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
        :disabled="!canAddTodo"
        :title="t('editor.todo')"
        :aria-label="t('editor.todo')"
        data-promptx-editor-action="todo-add"
        @mousedown.prevent
        @click="emit('add-todo')"
      >
        <Plus class="h-4 w-4" />
        <span class="sr-only sm:not-sr-only sm:inline">{{ t('editor.todo') }}</span>
      </button>
      <button
        type="button"
        class="tool-button relative inline-flex min-w-0 items-center justify-center gap-1.5 px-0 py-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
        :title="getTodoManageLabel()"
        :aria-label="getTodoManageLabel()"
        data-promptx-editor-action="todo-manage"
        @mousedown.prevent
        @click="emit('manage-todo')"
      >
        <List class="h-4 w-4" />
        <span class="sr-only sm:not-sr-only sm:inline">{{ getTodoManageLabel() }}</span>
        <span
          v-if="todoCount > 0"
          class="absolute right-1 top-1 min-w-[1rem] rounded-full bg-[var(--theme-primaryBg)] px-1 text-[10px] font-semibold leading-4 text-[var(--theme-primaryText)] sm:hidden"
        >
          {{ todoCount > 9 ? '9+' : todoCount }}
        </span>
      </button>
      <button
        type="button"
        class="tool-button tool-button-primary inline-flex min-w-0 items-center justify-center gap-1.5 px-0 py-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
        :disabled="isCurrentTaskSending"
        :title="t('editor.send')"
        :aria-label="t('editor.send')"
        data-promptx-editor-action="send"
        @mousedown.prevent
        @click="emit('send-request')"
      >
        <LoaderCircle v-if="sendBusy" class="h-4 w-4 animate-spin" />
        <SendHorizontal v-else class="h-4 w-4" />
        <span class="sr-only sm:not-sr-only sm:inline">{{ t('editor.send') }}</span>
      </button>
    </div>

    <div
      v-if="showAgentSelector"
      class="flex w-full overflow-x-auto pb-0.5 sm:justify-end"
      :title="t('editor.selectAgent')"
      data-promptx-agent-targets
      @mousedown.stop
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <button
          v-for="item in agentOptions"
          :key="item.engine"
          type="button"
          class="theme-agent-selector-button"
          :class="item.engine === selectedAgentEngineValue ? 'theme-filter-active' : 'theme-filter-idle'"
          :aria-pressed="item.engine === selectedAgentEngineValue"
          :title="getAgentOptionLabel(item)"
          :data-agent-engine="item.engine"
          @mousedown.prevent
          @click="emit('update:selectedAgentEngine', item.engine)"
        >
          {{ getAgentOptionLabel(item) }}
        </button>
      </div>
    </div>
  </div>
</template>
