<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import BlockEditor from '../components/BlockEditor.vue'
import TaskDiffReviewDialog from '../components/TaskDiffReviewDialog.vue'
import CodexSessionPanel from '../components/CodexSessionPanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import WorkbenchEditorActions from '../components/WorkbenchEditorActions.vue'
import WorkbenchMobileDetailHeader from '../components/WorkbenchMobileDetailHeader.vue'
import WorkbenchSettingsDialog from '../components/WorkbenchSettingsDialog.vue'
import WorkbenchTaskListPanel from '../components/WorkbenchTaskListPanel.vue'
import TopToast from '../components/TopToast.vue'
import { usePageTitle } from '../composables/usePageTitle.js'
import { useToast } from '../composables/useToast.js'
import { useWorkbenchTasks } from '../composables/useWorkbenchTasks.js'

const showClearDialog = ref(false)
const showDeleteDialog = ref(false)
const showDiffDialog = ref(false)
const showSettingsDialog = ref(false)
const editingTaskTitleSlug = ref('')
const diffFocusToken = ref(0)
const preferredDiffScope = ref('workspace')
const preferredDiffRunId = ref('')
const { toastMessage, flashToast, clearToast } = useToast()

const codexPanelRef = ref(null)
const isMobileLayout = ref(false)
const mobileView = ref('tasks')
const mobileDetailTab = ref('activity')
const MOBILE_BREAKPOINT_QUERY = '(max-width: 1023px)'
const MOBILE_DETAIL_HISTORY_KEY = 'promptxWorkbenchMobileView'
let mobileMediaQueryList = null
let removeMobileMediaQueryListener = () => {}

function getCurrentPanelRef(currentTaskSlug) {
  if (!currentTaskSlug) {
    return null
  }

  return codexPanelRef.value
}

function scrollCurrentPanelToBottom() {
  nextTick(() => {
    getCurrentPanelRef(currentTaskSlug.value)?.scrollToBottom?.()
  })
}

const {
  buildPromptForTask,
  clearCurrentTaskContent,
  createTaskAndSelect,
  creatingTask,
  currentSelectedSessionId,
  currentTaskAutoTitle,
  currentTaskDisplayTitle,
  currentTaskSlug,
  draft,
  editorRef,
  error,
  handleImportPdfFiles,
  handleImportTextFiles,
  handleTaskSendingChange,
  handleTaskSessionChange,
  handleUpload,
  hasUnsavedChanges,
  initializeWorkbench,
  isCurrentTaskSending,
  loadingTask,
  loadingTasks,
  pageTitle,
  prepareCodexPromptForTask,
  removeCurrentTask,
  removingTask,
  renderedTasks,
  saveTask,
  saving,
  selectTask,
  updateLastPromptPreview,
  uploading,
} = useWorkbenchTasks({
  clearToast,
  flashToast,
  scrollCurrentPanelToBottom,
})

const currentRenderedTask = computed(() =>
  renderedTasks.value.find((task) => task.slug === currentTaskSlug.value) || null
)
const currentTaskDiffSupported = computed(() => Boolean(currentRenderedTask.value?.workspaceDiffSummary?.supported))

function resolvePreferredMobileDetailTab(task) {
  if (task?.sending || Number(task?.codexRunCount || 0) > 0) {
    return 'activity'
  }

  return 'input'
}

usePageTitle(pageTitle)

function openTaskDiff(scope = 'workspace', runId = '') {
  preferredDiffScope.value = scope === 'run' ? 'run' : scope === 'task' ? 'task' : 'workspace'
  preferredDiffRunId.value = preferredDiffScope.value === 'run' ? String(runId || '') : ''
  showDiffDialog.value = true
  diffFocusToken.value += 1
}

function closeTaskDiff() {
  showDiffDialog.value = false
}

function openSettingsDialog() {
  showSettingsDialog.value = true
}

function closeSettingsDialog() {
  showSettingsDialog.value = false
}

function hasMobileDetailHistoryState(state) {
  return state?.[MOBILE_DETAIL_HISTORY_KEY] === 'detail'
}

function replaceMobileHistoryState(view = 'tasks') {
  if (typeof window === 'undefined') {
    return
  }

  const nextState = { ...(window.history.state || {}) }
  if (view === 'detail') {
    nextState[MOBILE_DETAIL_HISTORY_KEY] = 'detail'
  } else {
    delete nextState[MOBILE_DETAIL_HISTORY_KEY]
  }

  window.history.replaceState(nextState, '')
}

function pushMobileDetailHistoryState() {
  if (typeof window === 'undefined') {
    return
  }

  const nextState = {
    ...(window.history.state || {}),
    [MOBILE_DETAIL_HISTORY_KEY]: 'detail',
  }
  window.history.pushState(nextState, '')
}

function syncMobileViewFromHistory(state = null) {
  if (!isMobileLayout.value) {
    mobileView.value = 'detail'
    return
  }

  if (!currentTaskSlug.value) {
    mobileView.value = 'tasks'
    replaceMobileHistoryState('tasks')
    return
  }

  mobileView.value = hasMobileDetailHistoryState(state) ? 'detail' : 'tasks'
}

function updateMobileLayout(matches) {
  isMobileLayout.value = Boolean(matches)
  syncMobileViewFromHistory(typeof window === 'undefined' ? null : window.history.state)
}

function enterMobileDetail(options = {}) {
  const { pushHistory = true } = options
  mobileView.value = 'detail'
  if (!isMobileLayout.value) {
    return
  }

  if (pushHistory) {
    pushMobileDetailHistoryState()
    return
  }

  replaceMobileHistoryState('detail')
}

function leaveMobileDetail(options = {}) {
  const { useHistory = true } = options
  if (!isMobileLayout.value) {
    mobileView.value = 'tasks'
    return
  }

  if (useHistory && hasMobileDetailHistoryState(window.history.state)) {
    window.history.back()
    return
  }

  mobileView.value = 'tasks'
  replaceMobileHistoryState('tasks')
}

function handlePopState(event) {
  if (!isMobileLayout.value) {
    return
  }

  mobileView.value = hasMobileDetailHistoryState(event.state) && currentTaskSlug.value ? 'detail' : 'tasks'
}

async function handleTaskTitleBlur() {
  editingTaskTitleSlug.value = ''
  if (hasUnsavedChanges.value) {
    await saveTask({ auto: false, silent: true })
  }
}

function beginTaskTitleEdit(taskSlug) {
  if (taskSlug !== currentTaskSlug.value) {
    return
  }

  editingTaskTitleSlug.value = taskSlug
  nextTick(() => {
    const element = document.querySelector('[data-task-title-input="current"]')
    element?.focus?.()
    element?.select?.()
  })
}

async function handleTaskTitleClick(taskSlug) {
  if (isMobileLayout.value) {
    await handleTaskSelect(taskSlug)
    return
  }

  if (taskSlug !== currentTaskSlug.value) {
    await handleTaskSelect(taskSlug)
    return
  }

  beginTaskTitleEdit(taskSlug)
}

function openDeleteDialog() {
  showDeleteDialog.value = true
}

function closeDeleteDialog() {
  if (removingTask.value) {
    return
  }

  showDeleteDialog.value = false
}

async function confirmRemoveCurrentTask() {
  await removeCurrentTask()
  showDeleteDialog.value = false
  if (isMobileLayout.value) {
    leaveMobileDetail({ useHistory: false })
  }
}

function openClearDialog() {
  showClearDialog.value = true
}

function closeClearDialog() {
  showClearDialog.value = false
}

function clearAllContent() {
  showClearDialog.value = false
  clearCurrentTaskContent()
}

async function copyCodexPrompt() {
  await navigator.clipboard.writeText(buildPromptForTask(currentTaskSlug.value))
  flashToast('已复制给 Codex')
}

async function handleCreateTask() {
  const created = await createTaskAndSelect()
  if (created && isMobileLayout.value) {
    mobileDetailTab.value = 'input'
    enterMobileDetail()
  }
}

async function handleTaskSelect(taskSlug) {
  const targetSlug = String(taskSlug || '').trim()
  if (!targetSlug) {
    return
  }

  if (targetSlug !== currentTaskSlug.value) {
    await selectTask(targetSlug)
  }

  if (isMobileLayout.value && currentTaskSlug.value === targetSlug) {
    mobileDetailTab.value = resolvePreferredMobileDetailTab(currentRenderedTask.value)
    enterMobileDetail()
  }
}

async function sendToCodex() {
  const taskSlug = currentTaskSlug.value
  if (!taskSlug) {
    return
  }

  updateLastPromptPreview(taskSlug, buildPromptForTask(taskSlug))
  const didSend = await getCurrentPanelRef(taskSlug)?.send?.()
  if (!didSend || taskSlug !== currentTaskSlug.value) {
    return
  }

  if (isMobileLayout.value) {
    mobileDetailTab.value = 'activity'
  }
  clearCurrentTaskContent({ silent: true })
  await saveTask({ auto: false, silent: true })
}

function stopCodex() {
  getCurrentPanelRef(currentTaskSlug.value)?.stop?.()
}

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges.value && !uploading.value && !saving.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

function handleWindowKeydown(event) {
  if (!event.metaKey && !event.ctrlKey && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    sendToCodex()
    return
  }

  if (!(event.metaKey || event.ctrlKey)) {
    return
  }

  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveTask({ auto: false })
    return
  }

  if (event.shiftKey && event.key === 'Backspace') {
    event.preventDefault()
    openClearDialog()
  }
}

onMounted(() => {
  initializeWorkbench()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mobileMediaQueryList = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    updateMobileLayout(mobileMediaQueryList.matches)
    const handleMediaChange = (event) => {
      updateMobileLayout(event.matches)
    }

    if (typeof mobileMediaQueryList.addEventListener === 'function') {
      mobileMediaQueryList.addEventListener('change', handleMediaChange)
      removeMobileMediaQueryListener = () => mobileMediaQueryList?.removeEventListener('change', handleMediaChange)
    } else if (typeof mobileMediaQueryList.addListener === 'function') {
      mobileMediaQueryList.addListener(handleMediaChange)
      removeMobileMediaQueryListener = () => mobileMediaQueryList?.removeListener(handleMediaChange)
    }
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('popstate', handlePopState)
})

onBeforeUnmount(() => {
  removeMobileMediaQueryListener()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <TopToast :message="toastMessage" />

    <ConfirmDialog
      :open="showClearDialog"
      title="确认清空当前任务？"
      description="将清空右侧编辑区内容，但会保留当前任务本身。"
      confirm-text="确认清空"
      cancel-text="继续编辑"
      @cancel="closeClearDialog"
      @confirm="clearAllContent"
    />
    <ConfirmDialog
      :open="showDeleteDialog"
      title="确认删除当前任务？"
      :description="`将删除「${currentTaskDisplayTitle}」，删除后无法恢复。`"
      confirm-text="确认删除"
      cancel-text="先保留"
      :loading="removingTask"
      danger
      @cancel="closeDeleteDialog"
      @confirm="confirmRemoveCurrentTask"
    />
    <TaskDiffReviewDialog
      :open="showDiffDialog"
      :task-slug="currentTaskSlug"
      :task-title="currentTaskDisplayTitle"
      :preferred-scope="preferredDiffScope"
      :preferred-run-id="preferredDiffRunId"
      :focus-token="diffFocusToken"
      @close="closeTaskDiff"
    />
    <WorkbenchSettingsDialog
      :open="showSettingsDialog"
      @close="closeSettingsDialog"
    />

    <div v-if="!isMobileLayout" class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1">
      <WorkbenchTaskListPanel
        :loading-tasks="loadingTasks"
        :tasks="renderedTasks"
        :current-task-slug="currentTaskSlug"
        :editing-task-title-slug="editingTaskTitleSlug"
        :draft-title="draft.title"
        :current-task-auto-title="draft.autoTitle || currentTaskAutoTitle"
        :creating-task="creatingTask"
        :loading-task="loadingTask"
        :uploading="uploading"
        :error="error"
        :removing-task="removingTask"
        :is-current-task-sending="isCurrentTaskSending"
        @open-settings="openSettingsDialog"
        @create-task="handleCreateTask"
        @select-task="handleTaskSelect"
        @title-click="handleTaskTitleClick"
        @title-blur="handleTaskTitleBlur"
        @cancel-title-edit="editingTaskTitleSlug = ''"
        @update:draft-title="draft.title = $event"
        @delete-task="openDeleteDialog"
      />

      <div class="grid min-h-0 gap-4 overflow-hidden lg:grid-cols-2 lg:grid-rows-1">
        <div class="min-h-0 min-w-0 overflow-hidden">
          <div v-if="currentRenderedTask" class="h-full min-h-0">
            <CodexSessionPanel
              ref="codexPanelRef"
              :active="Boolean(currentRenderedTask?.slug)"
              :task-slug="currentRenderedTask.slug"
              :build-prompt="() => prepareCodexPromptForTask(currentRenderedTask.slug)"
              :selected-session-id="currentRenderedTask.codexSessionId || ''"
              :session-selection-locked="Boolean(currentRenderedTask.sessionSelectionLocked)"
              :session-selection-lock-reason="currentRenderedTask.sessionSelectionLockReason || ''"
              :diff-supported="currentTaskDiffSupported"
              @sending-change="handleTaskSendingChange(currentRenderedTask.slug, $event)"
              @selected-session-change="handleTaskSessionChange(currentRenderedTask.slug, $event)"
              @open-diff="openTaskDiff($event.scope, $event.runId)"
            />
          </div>
        </div>

        <div class="min-h-0 min-w-0 overflow-hidden">
          <section v-if="loadingTask && !draft.blocks.length" class="panel theme-muted-text flex h-full items-center px-5 py-4 text-sm">
            正在加载任务内容...
          </section>
          <BlockEditor
            v-else
            ref="editorRef"
            v-model="draft.blocks"
            :codex-session-id="currentSelectedSessionId"
            :uploading="uploading"
            @upload-files="handleUpload"
            @import-text-files="handleImportTextFiles"
            @import-pdf-files="handleImportPdfFiles"
            @clear-request="openClearDialog"
          >
            <template #header-actions>
              <WorkbenchEditorActions
                :is-current-task-sending="isCurrentTaskSending"
                @open-file-picker="editorRef?.openFilePicker?.()"
                @clear-request="openClearDialog"
                @copy-request="copyCodexPrompt"
                @send-request="sendToCodex"
                @stop-request="stopCodex"
              />
            </template>
          </BlockEditor>
        </div>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-hidden">
      <WorkbenchTaskListPanel
        v-if="mobileView === 'tasks'"
        :loading-tasks="loadingTasks"
        :tasks="renderedTasks"
        :current-task-slug="currentTaskSlug"
        :editing-task-title-slug="editingTaskTitleSlug"
        :draft-title="draft.title"
        :current-task-auto-title="draft.autoTitle || currentTaskAutoTitle"
        :creating-task="creatingTask"
        :loading-task="loadingTask"
        :uploading="uploading"
        :error="error"
        :removing-task="removingTask"
        :is-current-task-sending="isCurrentTaskSending"
        mobile
        @open-settings="openSettingsDialog"
        @create-task="handleCreateTask"
        @select-task="handleTaskSelect"
        @title-click="handleTaskTitleClick"
        @title-blur="handleTaskTitleBlur"
        @cancel-title-edit="editingTaskTitleSlug = ''"
        @update:draft-title="draft.title = $event"
        @delete-task="openDeleteDialog"
      />

      <div v-else class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <WorkbenchMobileDetailHeader
          :current-task-slug="currentTaskSlug"
          :editing-task-title-slug="editingTaskTitleSlug"
          :title="currentTaskDisplayTitle"
          :title-input-value="draft.title"
          :current-task-auto-title="draft.autoTitle || currentTaskAutoTitle"
          @back="leaveMobileDetail"
          @begin-edit="beginTaskTitleEdit(currentTaskSlug)"
          @title-blur="handleTaskTitleBlur"
          @cancel-title-edit="editingTaskTitleSlug = ''"
          @update:title-input-value="draft.title = $event"
        />

        <section class="panel shrink-0 overflow-hidden">
          <div class="theme-divider border-b px-3 py-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="tool-button px-3 py-2 text-sm"
                :class="mobileDetailTab === 'activity' ? 'tool-button-primary' : ''"
                @click="mobileDetailTab = 'activity'"
              >
                执行
              </button>
              <button
                type="button"
                class="tool-button px-3 py-2 text-sm"
                :class="mobileDetailTab === 'input' ? 'tool-button-primary' : ''"
                @click="mobileDetailTab = 'input'"
              >
                输入
              </button>
            </div>
          </div>
        </section>

        <div class="min-h-0 flex-1 overflow-hidden">
          <div v-show="mobileDetailTab === 'activity'" class="h-full min-h-0">
            <div v-if="currentRenderedTask" class="h-full min-h-0">
              <CodexSessionPanel
                ref="codexPanelRef"
                :active="Boolean(currentRenderedTask?.slug)"
                :task-slug="currentRenderedTask.slug"
                :build-prompt="() => prepareCodexPromptForTask(currentRenderedTask.slug)"
                :selected-session-id="currentRenderedTask.codexSessionId || ''"
                :session-selection-locked="Boolean(currentRenderedTask.sessionSelectionLocked)"
                :session-selection-lock-reason="currentRenderedTask.sessionSelectionLockReason || ''"
                :diff-supported="currentTaskDiffSupported"
                @sending-change="handleTaskSendingChange(currentRenderedTask.slug, $event)"
                @selected-session-change="handleTaskSessionChange(currentRenderedTask.slug, $event)"
                @open-diff="openTaskDiff($event.scope, $event.runId)"
              />
            </div>
            <section v-else class="panel theme-muted-text flex h-full items-center px-5 py-4 text-sm">
              请选择一个任务
            </section>
          </div>

          <div v-show="mobileDetailTab === 'input'" class="h-full min-h-0">
            <section v-if="loadingTask && !draft.blocks.length" class="panel theme-muted-text flex h-full items-center px-5 py-4 text-sm">
              正在加载任务内容...
            </section>
            <BlockEditor
              v-else
              ref="editorRef"
              v-model="draft.blocks"
              :codex-session-id="currentSelectedSessionId"
              :uploading="uploading"
              @upload-files="handleUpload"
              @import-text-files="handleImportTextFiles"
              @import-pdf-files="handleImportPdfFiles"
              @clear-request="openClearDialog"
            >
              <template #header-actions>
                <WorkbenchEditorActions
                  :is-current-task-sending="isCurrentTaskSending"
                  @open-file-picker="editorRef?.openFilePicker?.()"
                  @clear-request="openClearDialog"
                  @copy-request="copyCodexPrompt"
                  @send-request="sendToCodex"
                  @stop-request="stopCodex"
                />
              </template>
            </BlockEditor>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
