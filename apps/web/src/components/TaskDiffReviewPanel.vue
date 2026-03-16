<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, CircleAlert, FileDiff, FolderOpen, GitBranch, RefreshCw } from 'lucide-vue-next'
import { getTaskGitDiff, listTaskCodexRuns } from '../lib/api.js'
import { subscribeServerEvents } from '../lib/serverEvents.js'
import WorkbenchSelect from './WorkbenchSelect.vue'

const props = defineProps({
  taskSlug: {
    type: String,
    default: '',
  },
  preferredScope: {
    type: String,
    default: 'task',
  },
  preferredRunId: {
    type: String,
    default: '',
  },
  focusToken: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: false,
  },
})

const diffScope = ref('task')
const selectedRunId = ref('')
const selectedFilePath = ref('')
const statusFilter = ref('all')
const runs = ref([])
const diffPayload = ref(null)
const loading = ref(false)
const error = ref('')

let loadRequestId = 0
let unsubscribeServerEvents = null
let lastLoadedSignature = ''

function buildLoadSignature(taskSlug, scope, runId = '') {
  return [String(taskSlug || '').trim(), scope === 'run' ? 'run' : 'task', String(runId || '').trim()].join('::')
}

const terminalRuns = computed(() => runs.value.filter((run) => run.completed))
const statusCounts = computed(() => {
  const counts = {
    all: 0,
    A: 0,
    M: 0,
    D: 0,
  }

  ;(diffPayload.value?.files || []).forEach((file) => {
    const status = normalizeFileStatus(file?.status)
    counts.all += 1
    counts[status] += 1
  })

  return counts
})
const filteredFiles = computed(() => {
  const files = diffPayload.value?.files || []
  if (statusFilter.value === 'all') {
    return files
  }

  return files.filter((file) => normalizeFileStatus(file?.status) === statusFilter.value)
})
const selectedFile = computed(() => {
  const files = filteredFiles.value
  return files.find((file) => file.path === selectedFilePath.value) || files[0] || null
})
const summaryText = computed(() => {
  const summary = diffPayload.value?.summary || { fileCount: 0, additions: 0, deletions: 0 }
  return `${summary.fileCount} 个文件 / +${summary.additions} / -${summary.deletions}`
})
const selectedPatchLines = computed(() => parsePatchLines(selectedFile.value?.patch || ''))

function getRunStatusLabel(run) {
  return run?.status === 'completed' ? '已完成' : run?.status === 'error' ? '失败' : '已停止'
}

function formatRunOptionLabel(run) {
  return `${new Date(run?.startedAt || run?.createdAt).toLocaleString('zh-CN')} · ${getRunStatusLabel(run)}`
}

function normalizeFileStatus(status = '') {
  const value = String(status || '').trim().toUpperCase()
  if (value === 'A' || value === 'D') {
    return value
  }
  return 'M'
}

function syncSelectedRun() {
  const nextRuns = terminalRuns.value
  if (!nextRuns.length) {
    selectedRunId.value = ''
    return
  }

  if (nextRuns.some((run) => run.id === selectedRunId.value)) {
    return
  }

  selectedRunId.value = nextRuns[0].id
}

function syncSelectedFile() {
  const files = filteredFiles.value
  if (!files.length) {
    selectedFilePath.value = ''
    return
  }

  if (files.some((file) => file.path === selectedFilePath.value)) {
    return
  }

  selectedFilePath.value = files[0].path
}

function parsePatchLines(patch = '') {
  const text = String(patch || '')
  if (!text) {
    return []
  }

  const lines = text.split('\n')
  const parsed = []
  let oldLine = 0
  let newLine = 0

  lines.forEach((line, index) => {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1])
      newLine = Number(hunkMatch[2])
      parsed.push({
        id: `hunk-${index}`,
        kind: 'hunk',
        oldNumber: '',
        newNumber: '',
        content: line,
      })
      return
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      parsed.push({
        id: `line-${index}`,
        kind: 'add',
        oldNumber: '',
        newNumber: newLine,
        content: line,
      })
      newLine += 1
      return
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      parsed.push({
        id: `line-${index}`,
        kind: 'delete',
        oldNumber: oldLine,
        newNumber: '',
        content: line,
      })
      oldLine += 1
      return
    }

    if (line.startsWith(' ')) {
      parsed.push({
        id: `line-${index}`,
        kind: 'context',
        oldNumber: oldLine,
        newNumber: newLine,
        content: line,
      })
      oldLine += 1
      newLine += 1
      return
    }

    parsed.push({
      id: `line-${index}`,
      kind: 'meta',
      oldNumber: '',
      newNumber: '',
      content: line,
    })
  })

  return parsed
}

function getStatusLabel(status = '') {
  if (normalizeFileStatus(status) === 'A') {
    return '新增'
  }
  if (normalizeFileStatus(status) === 'D') {
    return '删除'
  }
  return '修改'
}

function getStatusClass(status = '') {
  if (normalizeFileStatus(status) === 'A') {
    return 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-[#5b7562] dark:bg-[#243228] dark:text-[#deecdf]'
  }
  if (normalizeFileStatus(status) === 'D') {
    return 'border-red-300 bg-red-100 text-red-900 dark:border-[#7b4f4a] dark:bg-[#372321] dark:text-[#f0dfdc]'
  }
  return 'border-amber-300 bg-amber-100 text-amber-900 dark:border-[#7f6949] dark:bg-[#392f20] dark:text-[#f4ddb0]'
}

function getFilterLabel(filter = 'all') {
  if (filter === 'A') {
    return '新增'
  }
  if (filter === 'D') {
    return '删除'
  }
  if (filter === 'M') {
    return '修改'
  }
  return '全部'
}

function getFilterButtonClass(filter = 'all') {
  const activeClass = 'border-stone-500 bg-stone-100 text-stone-900 dark:border-[#73665c] dark:bg-[#332c27] dark:text-stone-100'
  const inactiveClass = 'border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-[#453c36] dark:bg-[#26211d] dark:text-stone-300 dark:hover:bg-[#2f2924]'
  return statusFilter.value === filter ? activeClass : inactiveClass
}

function getPatchLineClass(kind = 'context') {
  if (kind === 'add') {
    return 'bg-emerald-50 text-emerald-950 dark:bg-[#213127] dark:text-[#deecdf]'
  }
  if (kind === 'delete') {
    return 'bg-red-50 text-red-950 dark:bg-[#352321] dark:text-[#f0dfdc]'
  }
  if (kind === 'hunk') {
    return 'bg-amber-50 text-amber-900 dark:bg-[#33291f] dark:text-[#f4ddb0]'
  }
  if (kind === 'meta') {
    return 'bg-stone-50 text-stone-500 dark:bg-[#241f1b] dark:text-stone-400'
  }
  return 'text-stone-800 dark:text-stone-200'
}

async function loadRuns() {
  if (!props.taskSlug) {
    runs.value = []
    selectedRunId.value = ''
    return
  }

  const payload = await listTaskCodexRuns(props.taskSlug, { limit: 20 })
  runs.value = payload.items || []
  syncSelectedRun()
}

async function loadDiff() {
  if (!props.taskSlug || !props.active) {
    return
  }

  const currentRequestId = ++loadRequestId
  loading.value = true
  error.value = ''

  try {
    await loadRuns()

    const scope = diffScope.value === 'run' ? 'run' : 'task'
    if (scope === 'run' && !selectedRunId.value) {
      diffPayload.value = {
        supported: false,
        reason: '当前还没有可用于审查的历史执行记录。',
        repoRoot: '',
        summary: { fileCount: 0, additions: 0, deletions: 0 },
        files: [],
      }
      syncSelectedFile()
      return
    }

    const payload = await getTaskGitDiff(props.taskSlug, {
      scope,
      runId: scope === 'run' ? selectedRunId.value : '',
    })

    if (currentRequestId !== loadRequestId) {
      return
    }

    diffPayload.value = payload
    lastLoadedSignature = buildLoadSignature(props.taskSlug, scope, scope === 'run' ? selectedRunId.value : '')
    syncSelectedFile()
  } catch (err) {
    if (currentRequestId !== loadRequestId) {
      return
    }

    error.value = err.message
    diffPayload.value = null
  } finally {
    if (currentRequestId === loadRequestId) {
      loading.value = false
    }
  }
}

function requestLoadDiff({ force = false } = {}) {
  if (!props.taskSlug || !props.active) {
    return
  }

  const signature = buildLoadSignature(props.taskSlug, diffScope.value, diffScope.value === 'run' ? selectedRunId.value : '')
  if (!force && signature === lastLoadedSignature) {
    return
  }

  loadDiff().catch(() => {})
}

watch(
  () => [props.taskSlug, props.active, diffScope.value, selectedRunId.value],
  ([taskSlug, active], previousValue = []) => {
    const previousTaskSlug = previousValue[0] || ''
    if (taskSlug !== previousTaskSlug) {
      selectedFilePath.value = ''
      lastLoadedSignature = ''
    }

    if (!taskSlug || !active) {
      return
    }

    requestLoadDiff()
  },
  { immediate: true }
)

watch(
  () => [statusFilter.value, diffPayload.value?.files?.length || 0],
  () => {
    syncSelectedFile()
  }
)

watch(
  () => [props.preferredScope, props.preferredRunId, props.focusToken],
  ([scope, runId, focusToken], previousValue = []) => {
    const previousFocusToken = Number(previousValue[2] || 0)
    const nextScope = scope === 'run' ? 'run' : 'task'
    const nextRunId = nextScope === 'run' && runId ? String(runId || '') : ''
    const scopeChanged = diffScope.value !== nextScope
    const runChanged = nextScope === 'run' && nextRunId && selectedRunId.value !== nextRunId

    diffScope.value = nextScope
    if (nextRunId) {
      selectedRunId.value = nextRunId
    }
    if (nextScope !== 'run') {
      selectedRunId.value = ''
    }
    if (!scopeChanged && !runChanged && props.active && props.taskSlug && focusToken !== previousFocusToken) {
      lastLoadedSignature = ''
      requestLoadDiff()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unsubscribeServerEvents?.()
})

if (typeof window !== 'undefined' && !unsubscribeServerEvents) {
  unsubscribeServerEvents = subscribeServerEvents((event) => {
    const eventType = String(event.type || '').trim()
    const eventTaskSlug = String(event.taskSlug || '').trim()
    const currentTaskSlug = String(props.taskSlug || '').trim()

    if (!props.active || !currentTaskSlug) {
      return
    }

    if (eventType === 'ready') {
      requestLoadDiff({ force: true })
      return
    }

    if ((eventType === 'runs.changed' || eventType === 'tasks.changed') && (!eventTaskSlug || eventTaskSlug === currentTaskSlug)) {
      lastLoadedSignature = ''
      requestLoadDiff({ force: true })
    }
  })
}
</script>

<template>
  <section class="panel flex h-full min-h-0 flex-col overflow-hidden">
    <div class="border-b border-stone-200 px-4 py-3 dark:border-[#39312c]">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="tool-button inline-flex items-center gap-2 px-3 py-2 text-xs"
          :class="diffScope === 'task' ? 'border-stone-500 bg-stone-100 text-stone-900 dark:border-[#73665c] dark:bg-[#332c27] dark:text-stone-100' : ''"
          @click="diffScope = 'task'"
        >
          <span>本任务</span>
        </button>
        <button
          type="button"
          class="tool-button inline-flex items-center gap-2 px-3 py-2 text-xs"
          :class="diffScope === 'run' ? 'border-stone-500 bg-stone-100 text-stone-900 dark:border-[#73665c] dark:bg-[#332c27] dark:text-stone-100' : ''"
          @click="diffScope = 'run'"
        >
          <span>本轮</span>
        </button>

        <WorkbenchSelect
          v-if="diffScope === 'run'"
          v-model="selectedRunId"
          class="min-w-0 flex-1 sm:max-w-[360px]"
          :options="terminalRuns"
          :loading="loading"
          :get-option-value="(run) => run?.id || ''"
          placeholder="请选择历史执行"
          empty-text="暂无可查看的历史执行"
        >
          <template #trigger="{ selectedOption }">
            <div class="truncate text-xs text-stone-700 dark:text-stone-200">
              {{ selectedOption ? formatRunOptionLabel(selectedOption) : '请选择历史执行' }}
            </div>
          </template>

          <template #header>
            <div class="border-b border-dashed border-stone-300 px-3 py-2 text-[11px] text-stone-500 dark:border-[#544941] dark:text-stone-400">
              共 {{ terminalRuns.length }} 条可审查执行
            </div>
          </template>

          <template #option="{ option, selected, select }">
            <button
              type="button"
              class="w-full rounded-sm border border-dashed px-3 py-2 text-left transition"
              :class="selected
                ? 'border-stone-500 bg-stone-50 dark:border-[#73665c] dark:bg-[#332c27]'
                : 'border-stone-300 bg-white hover:border-stone-500 dark:border-[#453c36] dark:bg-[#26211d] dark:hover:border-[#73665c]'"
              @click="select"
            >
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-xs font-medium text-stone-900 dark:text-stone-100">
                    {{ new Date(option.startedAt || option.createdAt).toLocaleString('zh-CN') }}
                  </div>
                  <div class="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                    {{ getRunStatusLabel(option) }}
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

        <button
          type="button"
          class="tool-button ml-auto inline-flex items-center gap-2 px-3 py-2 text-xs"
          :disabled="loading"
          @click="loadDiff"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
          <span>{{ loading ? '刷新中...' : '刷新' }}</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="border-b border-stone-200 px-4 py-3 text-sm text-red-700 dark:border-[#39312c] dark:text-red-300">
      <div class="inline-flex items-start gap-2">
        <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="break-all">{{ error }}</span>
      </div>
    </div>

    <div v-if="loading && !diffPayload" class="flex flex-1 items-center justify-center px-5 text-sm text-stone-500 dark:text-stone-400">
      正在读取代码变更...
    </div>

    <div v-else-if="diffPayload && !diffPayload.supported" class="flex flex-1 items-center justify-center px-5">
      <div class="w-full max-w-xl rounded-sm border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-600 dark:border-[#544941] dark:bg-[#2d2723] dark:text-stone-300">
        <div class="inline-flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
          <FileDiff class="h-4 w-4" />
          <span>暂时无法查看代码变更</span>
        </div>
        <p class="mt-2 break-all leading-7">{{ diffPayload.reason || '当前没有可展示的代码变更。' }}</p>
        <div v-if="diffPayload.repoRoot" class="mt-3 flex flex-wrap gap-2 text-xs">
          <div class="inline-flex items-center gap-2 rounded-sm border border-dashed border-stone-300 bg-white/80 px-2.5 py-1.5 text-stone-700 dark:border-[#544941] dark:bg-[#26211d] dark:text-stone-300">
            <FolderOpen class="h-3.5 w-3.5 shrink-0" />
            <span class="break-all">{{ diffPayload.repoRoot }}</span>
          </div>
          <div
            v-if="diffPayload.branch"
            class="inline-flex items-center gap-2 rounded-sm border border-dashed border-emerald-300 bg-emerald-50/90 px-2.5 py-1.5 text-emerald-800 dark:border-[#5b7562] dark:bg-[#243228] dark:text-[#cfe7d5]"
          >
            <GitBranch class="h-3.5 w-3.5 shrink-0" />
            <span>{{ diffPayload.branch }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="diffPayload" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="border-b border-stone-200 px-4 py-3 text-xs text-stone-600 dark:border-[#39312c] dark:text-stone-400">
        <div class="flex flex-wrap items-center gap-2">
          <div
            v-if="diffPayload.repoRoot"
            class="inline-flex min-w-0 items-center gap-2 rounded-sm border border-dashed border-sky-300 bg-sky-50 px-2.5 py-1.5 text-sky-900 dark:border-[#4b6773] dark:bg-[#1f2c33] dark:text-[#cfe7f0]"
          >
            <FolderOpen class="h-3.5 w-3.5 shrink-0" />
            <span class="min-w-0 break-all">{{ diffPayload.repoRoot }}</span>
          </div>
          <div
            class="inline-flex items-center gap-2 rounded-sm border border-dashed border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-emerald-900 dark:border-[#5b7562] dark:bg-[#243228] dark:text-[#deecdf]"
          >
            <GitBranch class="h-3.5 w-3.5 shrink-0" />
            <span>{{ diffPayload.branch || '未识别分支' }}</span>
            <span class="opacity-50">•</span>
            <span class="text-stone-700 dark:text-stone-200">{{ diffPayload.summary?.fileCount || 0 }} 个文件</span>
            <span class="opacity-50">•</span>
            <span class="font-medium text-emerald-700 dark:text-emerald-300">+{{ diffPayload.summary?.additions || 0 }}</span>
            <span class="font-medium text-red-700 dark:text-red-300">-{{ diffPayload.summary?.deletions || 0 }}</span>
          </div>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
        <div class="min-h-0 overflow-y-auto border-r border-stone-200 bg-stone-50/70 p-3 dark:border-[#39312c] dark:bg-[#221d1a]">
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              v-for="filter in ['all', 'A', 'M', 'D']"
              :key="filter"
              type="button"
              class="rounded-sm border px-2 py-1 text-[11px] transition"
              :class="getFilterButtonClass(filter)"
              @click="statusFilter = filter"
            >
              {{ getFilterLabel(filter) }} {{ statusCounts[filter] || 0 }}
            </button>
          </div>

          <div v-if="!diffPayload.files.length" class="rounded-sm border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500 dark:border-[#544941] dark:text-stone-400">
            当前范围内还没有检测到代码变更。
          </div>
          <div v-else-if="!filteredFiles.length" class="rounded-sm border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500 dark:border-[#544941] dark:text-stone-400">
            当前筛选条件下没有匹配文件。
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="file in filteredFiles"
              :key="file.path"
              type="button"
              class="w-full rounded-sm border px-3 py-2 text-left transition"
              :class="file.path === selectedFilePath
                ? 'border-stone-500 bg-stone-100 text-stone-900 dark:border-[#73665c] dark:bg-[#332c27] dark:text-stone-100'
                : 'border-stone-300 bg-white hover:bg-stone-100 dark:border-[#453c36] dark:bg-[#26211d] dark:text-stone-200 dark:hover:bg-[#2f2924]'"
              @click="selectedFilePath = file.path"
            >
              <div class="flex items-start gap-2">
                <span class="inline-flex shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px]" :class="getStatusClass(file.status)">
                  {{ getStatusLabel(file.status) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="break-all text-xs font-medium">{{ file.path }}</div>
                  <div class="mt-1 text-[11px] opacity-75">+{{ file.additions }} / -{{ file.deletions }}</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="min-h-0 overflow-hidden bg-white dark:bg-[#1f1a17]">
          <div v-if="selectedFile" class="flex h-full min-h-0 flex-col overflow-hidden">
            <div class="border-b border-stone-200 px-4 py-3 text-xs text-stone-600 dark:border-[#39312c] dark:text-stone-400">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex rounded-sm border px-1.5 py-0.5 text-[10px]" :class="getStatusClass(selectedFile.status)">
                  {{ getStatusLabel(selectedFile.status) }}
                </span>
                <span class="break-all font-medium text-stone-900 dark:text-stone-100">{{ selectedFile.path }}</span>
                <span class="opacity-75">+{{ selectedFile.additions }} / -{{ selectedFile.deletions }}</span>
              </div>
            </div>

            <div v-if="selectedFile.message" class="flex-1 overflow-y-auto px-4 py-4 text-sm text-stone-600 dark:text-stone-300">
              <div class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-4 py-4 dark:border-[#544941] dark:bg-[#2d2723]">
                {{ selectedFile.message }}
              </div>
            </div>
            <div v-else-if="selectedPatchLines.length" class="flex-1 overflow-auto">
              <div class="min-w-max px-4 py-4 font-mono text-[11px] leading-5">
                <div
                  v-for="line in selectedPatchLines"
                  :key="line.id"
                  class="grid grid-cols-[56px_56px_minmax(0,1fr)]"
                  :class="getPatchLineClass(line.kind)"
                >
                  <span class="select-none border-r border-stone-200/70 px-2 py-0.5 text-right opacity-60 dark:border-[#39312c]">
                    {{ line.oldNumber }}
                  </span>
                  <span class="select-none border-r border-stone-200/70 px-2 py-0.5 text-right opacity-60 dark:border-[#39312c]">
                    {{ line.newNumber }}
                  </span>
                  <pre class="overflow-visible whitespace-pre px-3 py-0.5">{{ line.content }}</pre>
                </div>
              </div>
            </div>
            <div v-else class="flex-1 overflow-y-auto px-4 py-4 text-sm text-stone-600 dark:text-stone-300">
              <div class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-4 py-4 dark:border-[#544941] dark:bg-[#2d2723]">
                当前文件没有可展示的 diff 内容。
              </div>
            </div>
          </div>

          <div v-else class="flex h-full items-center justify-center px-5 text-sm text-stone-500 dark:text-stone-400">
            请选择一个文件查看 diff。
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
