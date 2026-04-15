<script setup>
import { ref } from 'vue'
import CodexSessionPanel from './CodexSessionPanel.vue'

const props = defineProps({
  taskSlug: {
    type: String,
    default: '',
  },
  buildPrompt: {
    type: Function,
    default: null,
  },
  buildPromptBlocks: {
    type: Function,
    default: null,
  },
  selectedSessionId: {
    type: String,
    default: '',
  },
  selectedAgentEngine: {
    type: String,
    default: '',
  },
  sessionSelectionLocked: {
    type: Boolean,
    default: false,
  },
  sessionSelectionLockReason: {
    type: String,
    default: '',
  },
  diffSupported: {
    type: Boolean,
    default: false,
  },
  taskRunning: {
    type: Boolean,
    default: false,
  },
  emptyMessage: {
    type: String,
    default: '',
  },
})

const emit = defineEmits([
  'agent-bindings-change',
  'insert-code-context',
  'sending-change',
  'project-created',
  'selected-session-change',
  'open-diff',
  'toast',
  'update:selectedAgentEngine',
])

const panelRef = ref(null)

function send() {
  return panelRef.value?.send?.()
}

function stop() {
  panelRef.value?.stop?.()
}

function scrollToBottom() {
  panelRef.value?.scrollToBottom?.()
}

function openProjectManager() {
  return panelRef.value?.openProjectManager?.() || false
}

function openSourceBrowser() {
  return panelRef.value?.openSourceBrowser?.() || false
}

function closeTopDialog() {
  return panelRef.value?.closeTopDialog?.() || false
}

defineExpose({
  closeTopDialog,
  openProjectManager,
  openSourceBrowser,
  send,
  stop,
  scrollToBottom,
})
</script>

<template>
  <div v-if="taskSlug" class="h-full min-h-0">
    <CodexSessionPanel
      ref="panelRef"
      :active="Boolean(taskSlug)"
      :task-slug="taskSlug"
      :build-prompt="buildPrompt || (() => '')"
      :build-prompt-blocks="buildPromptBlocks || (() => [])"
      :selected-session-id="selectedSessionId"
      :selected-agent-engine="selectedAgentEngine"
      :session-selection-locked="sessionSelectionLocked"
      :session-selection-lock-reason="sessionSelectionLockReason"
      :diff-supported="diffSupported"
      :task-running="taskRunning"
      @agent-bindings-change="emit('agent-bindings-change', $event)"
      @insert-code-context="emit('insert-code-context', $event)"
      @project-created="emit('project-created', $event)"
      @sending-change="emit('sending-change', $event)"
      @selected-session-change="emit('selected-session-change', $event)"
      @update:selected-agent-engine="emit('update:selectedAgentEngine', $event)"
      @open-diff="emit('open-diff', $event)"
      @toast="emit('toast', $event)"
    />
  </div>
  <section
    v-else-if="emptyMessage"
    class="panel theme-muted-text flex h-full items-center px-5 py-4 text-sm"
  >
    {{ emptyMessage }}
  </section>
</template>
