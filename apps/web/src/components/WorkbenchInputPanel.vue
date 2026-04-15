<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TiptapBlockEditor from './TiptapBlockEditor.vue'
import WorkbenchEditorActions from './WorkbenchEditorActions.vue'
import { useI18n } from '../composables/useI18n.js'

const props = defineProps({
  canAddTodo: {
    type: Boolean,
    default: false,
  },
  agentBindings: {
    type: Array,
    default: () => [],
  },
  selectedAgentEngine: {
    type: String,
    default: '',
  },
  codexSessionId: {
    type: String,
    default: '',
  },
  isCurrentTaskSending: {
    type: Boolean,
    default: false,
  },
  sendState: {
    type: String,
    default: 'idle',
  },
  sendBehavior: {
    type: String,
    default: 'shift_enter',
  },
  modelValue: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  todoCount: {
    type: Number,
    default: 0,
  },
  uploading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'add-todo',
  'update:modelValue',
  'upload-files',
  'import-text-files',
  'import-pdf-files',
  'file-feedback',
  'clear-request',
  'copy-request',
  'manage-todo',
  'send-request',
  'update:selectedAgentEngine',
])

const blockEditorRef = ref(null)
const { t } = useI18n()
const displayedAgentBindings = ref([])
const displayedSelectedAgentEngine = ref('')
let agentSelectorSyncTimer = null

const blocks = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

function openFilePicker() {
  blockEditorRef.value?.openFilePicker?.()
}

function focusEditor() {
  blockEditorRef.value?.focusEditor?.()
}

function flushPendingInput() {
  return blockEditorRef.value?.flushPendingInput?.() || false
}

function insertBlocks(blocksToInsert) {
  blockEditorRef.value?.insertBlocks?.(blocksToInsert)
}

function insertImportedBlocks(importedBlocks) {
  blockEditorRef.value?.insertImportedBlocks?.(importedBlocks)
}

function insertUploadedBlocks(uploadedBlocks) {
  blockEditorRef.value?.insertUploadedBlocks?.(uploadedBlocks)
}

function isImportedBlockActive() {
  return blockEditorRef.value?.isImportedBlockActive?.() || false
}

function isComposing() {
  return blockEditorRef.value?.isComposing?.() || false
}

function isEditing() {
  return blockEditorRef.value?.isEditing?.() || false
}

function clearAgentSelectorSyncTimer() {
  if (agentSelectorSyncTimer) {
    clearTimeout(agentSelectorSyncTimer)
    agentSelectorSyncTimer = null
  }
}

function syncDisplayedAgentSelector(options = {}) {
  const { force = false } = options
  if (!force && isComposing()) {
    clearAgentSelectorSyncTimer()
    agentSelectorSyncTimer = setTimeout(() => {
      syncDisplayedAgentSelector()
    }, 120)
    return
  }

  clearAgentSelectorSyncTimer()
  displayedAgentBindings.value = Array.isArray(props.agentBindings) ? props.agentBindings : []
  displayedSelectedAgentEngine.value = String(props.selectedAgentEngine || '').trim()
}

function handleSelectedAgentEngineUpdate(value) {
  displayedSelectedAgentEngine.value = String(value || '').trim()
  emit('update:selectedAgentEngine', value)
}

watch(
  () => props.agentBindings,
  () => {
    syncDisplayedAgentSelector()
  },
  { deep: true, immediate: true }
)

watch(
  () => props.selectedAgentEngine,
  () => {
    syncDisplayedAgentSelector()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearAgentSelectorSyncTimer()
})

defineExpose({
  focusEditor,
  flushPendingInput,
  insertBlocks,
  insertImportedBlocks,
  insertUploadedBlocks,
  isComposing,
  isEditing,
  isImportedBlockActive,
  openFilePicker,
})
</script>

<template>
  <section
    v-if="loading && !modelValue.length"
    class="panel theme-muted-text flex h-full items-center px-5 py-4 text-sm"
  >
    {{ t('workbench.loadingTaskContent') }}
  </section>
  <TiptapBlockEditor
    v-else
    ref="blockEditorRef"
    v-model="blocks"
    :codex-session-id="codexSessionId"
    :send-behavior="sendBehavior"
    :uploading="uploading"
    @upload-files="emit('upload-files', $event)"
    @import-text-files="emit('import-text-files', $event)"
    @import-pdf-files="emit('import-pdf-files', $event)"
    @file-feedback="emit('file-feedback', $event)"
    @clear-request="emit('clear-request')"
    @send-request="emit('send-request')"
  >
    <template #header-actions>
      <WorkbenchEditorActions
        :can-add-todo="canAddTodo"
        :agent-bindings="displayedAgentBindings"
        :is-current-task-sending="isCurrentTaskSending"
        :selected-agent-engine="displayedSelectedAgentEngine"
        :send-state="sendState"
        :todo-count="todoCount"
        :uploading="uploading"
        @add-todo="emit('add-todo')"
        @open-file-picker="openFilePicker"
        @clear-request="emit('clear-request')"
        @copy-request="emit('copy-request')"
        @manage-todo="emit('manage-todo')"
        @send-request="emit('send-request')"
        @update:selected-agent-engine="handleSelectedAgentEngineUpdate"
      />
    </template>
  </TiptapBlockEditor>
</template>
