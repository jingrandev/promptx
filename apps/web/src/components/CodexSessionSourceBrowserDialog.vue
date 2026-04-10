<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  ChevronRight,
  File,
  FileImage,
  FolderOpen,
  LoaderCircle,
  Search,
} from 'lucide-vue-next'
import DialogShell from './DialogShell.vue'
import { useI18n } from '../composables/useI18n.js'
import { useTheme } from '../composables/useTheme.js'
import { useWorkspacePickerData } from '../composables/useWorkspacePickerData.js'
import { getCodexSessionFileContent } from '../lib/api.js'
import {
  exceedsHighlightThresholdForCode,
  renderSourceCodePreview,
  SOURCE_PREVIEW_HIGHLIGHT_LIMITS,
} from '../lib/sourceCodePreview.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  session: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])
const { t } = useI18n()
const { isDark } = useTheme()

const pickerProps = reactive({
  open: false,
  sessionId: '',
  query: '',
})

const selectedPath = ref('')
const selectedItemType = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const previewPayload = ref(null)

let previewRequestId = 0

const sessionId = computed(() => String(props.session?.id || '').trim())
const sessionCwd = computed(() => String(props.session?.cwd || '').trim())
const previewTitle = computed(() => previewPayload.value?.name || selectedPath.value || '')
const previewPath = computed(() => previewPayload.value?.path || selectedPath.value || '')
const previewSizeLabel = computed(() => formatFileSize(previewPayload.value?.size || 0))
const previewMetaLabel = computed(() => {
  const parts = []
  if (previewPath.value || previewTitle.value) {
    parts.push(previewPath.value || previewTitle.value)
  }
  if (previewPayload.value?.size) {
    parts.push(previewSizeLabel.value)
  }
  if (previewPayload.value?.truncated) {
    parts.push(t('sourceBrowser.truncated'))
  }
  return parts.join('  ')
})
const showImagePreview = computed(() => Boolean(previewPayload.value?.previewUrl))
const showBinaryState = computed(() => Boolean(previewPayload.value?.binary && !previewPayload.value?.previewUrl))
const showTextPreview = computed(() => Boolean(
  previewPayload.value
  && !previewPayload.value.binary
  && !previewPayload.value.previewUrl
))
const previewCodeHtml = ref('')
const previewCodeBg = ref('')
const previewCodeFg = ref('')
const previewGutterWidth = ref('2.6rem')

const {
  activeKey,
  activeTab,
  currentError,
  currentLoading,
  getDisplayName,
  getHighlightedName,
  getHighlightedPath,
  handleQueryChange,
  handleSessionChange,
  handleVisibleItemsChange,
  initializeData,
  normalSearchItems,
  recentSearchItems,
  resetData,
  setActiveTab,
  setItemRef,
  showSearchEmptyState,
  showSearchPromptState,
  showTreeEmptyState,
  toggleDirectory,
  treeItems,
  visibleItems,
} = useWorkspacePickerData({
  props: pickerProps,
  onSelect: handleSelectItem,
})

function formatFileSize(value = 0) {
  const size = Math.max(0, Number(value) || 0)
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function resetPreviewState() {
  previewRequestId += 1
  selectedPath.value = ''
  selectedItemType.value = ''
  previewLoading.value = false
  previewError.value = ''
  previewPayload.value = null
  previewCodeHtml.value = ''
  previewCodeBg.value = ''
  previewCodeFg.value = ''
  previewGutterWidth.value = '2.6rem'
}

async function renderPreviewCode() {
  if (!showTextPreview.value) {
    previewCodeHtml.value = ''
    previewCodeBg.value = ''
    previewCodeFg.value = ''
    return
  }

  const requestId = previewRequestId
  const content = String(previewPayload.value?.content || '').replace(/\r\n/g, '\n')
  const language = previewPayload.value?.language || ''
  const isLargePreview = exceedsHighlightThresholdForCode(content, SOURCE_PREVIEW_HIGHLIGHT_LIMITS)

  const rendered = await renderSourceCodePreview(previewPayload.value?.content || '', {
    isDark: isDark.value,
    language,
    maxHighlightLines: SOURCE_PREVIEW_HIGHLIGHT_LIMITS.maxLines,
    maxHighlightChars: SOURCE_PREVIEW_HIGHLIGHT_LIMITS.maxChars,
  })

  if (requestId !== previewRequestId) {
    return
  }

  previewCodeHtml.value = rendered.html
  previewCodeBg.value = isLargePreview ? '' : (rendered.bg || '')
  previewCodeFg.value = isLargePreview ? '' : (rendered.fg || '')
  previewGutterWidth.value = rendered.gutterWidth || '2.6rem'
}

async function loadPreview(pathValue = '') {
  const nextPath = String(pathValue || '').trim()
  if (!sessionId.value || !nextPath) {
    return
  }

  previewRequestId += 1
  const requestId = previewRequestId
  previewLoading.value = true
  previewError.value = ''

  try {
    const payload = await getCodexSessionFileContent(sessionId.value, {
      path: nextPath,
      limit: 200 * 1024,
      refreshToken: String(Date.now()),
    })

    if (requestId !== previewRequestId) {
      return
    }

    previewPayload.value = payload
    await renderPreviewCode()
  } catch (error) {
    if (requestId !== previewRequestId) {
      return
    }

    previewPayload.value = null
    previewError.value = error?.message || t('sourceBrowser.previewFailed')
  } finally {
    if (requestId === previewRequestId) {
      previewLoading.value = false
    }
  }
}

function handleSelectItem(item) {
  activeKey.value = item?.path || ''
  selectedPath.value = String(item?.path || '').trim()
  selectedItemType.value = String(item?.type || '').trim()
  previewError.value = ''

  if (item?.type === 'directory') {
    previewPayload.value = null
    if (activeTab.value === 'tree') {
      toggleDirectory(item.path)
    }
    return
  }

  loadPreview(item?.path)
}

watch(
  () => props.open,
  (open) => {
    pickerProps.open = open

    if (open) {
      pickerProps.sessionId = sessionId.value
      pickerProps.query = ''
      resetPreviewState()
      initializeData()
      return
    }

    resetPreviewState()
    resetData()
  },
  { immediate: true }
)

watch(
  sessionId,
  (value) => {
    pickerProps.sessionId = value
    if (props.open) {
      resetPreviewState()
      handleSessionChange()
    }
  }
)

watch(
  () => pickerProps.query,
  () => {
    handleQueryChange()
  }
)

watch(
  () => visibleItems.value,
  () => {
    handleVisibleItemsChange()
  },
  { deep: true }
)

watch(
  isDark,
  () => {
    if (!props.open || !showTextPreview.value) {
      return
    }

    renderPreviewCode()
  }
)
</script>

<template>
  <DialogShell
    :open="open"
    :stack-level="2"
    panel-class="settings-dialog-panel h-full sm:h-[90vh] sm:w-[90vw] sm:max-w-[90vw]"
    header-class="settings-dialog-header px-5 py-3.5"
    body-class="settings-dialog-body min-h-0 flex flex-1 flex-col overflow-hidden"
    @close="emit('close')"
  >
    <template #title>
      <div class="min-w-0">
        <div class="theme-heading truncate text-sm font-medium">{{ sessionCwd || t('sourceBrowser.title') }}</div>
      </div>
    </template>

    <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[21rem_minmax(0,1fr)]">
      <aside class="theme-divider flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
        <div class="theme-divider border-b px-4 py-3">
          <label class="block">
            <span class="sr-only">{{ t('sourceBrowser.searchLabel') }}</span>
            <div class="relative">
              <Search class="theme-muted-text pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                v-model="pickerProps.query"
                type="text"
                class="tool-input pl-9 text-sm"
                :placeholder="t('sourceBrowser.searchPlaceholder')"
              >
            </div>
          </label>

          <div class="mt-3 flex items-center gap-2">
            <button
              type="button"
              class="tool-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              :class="activeTab === 'tree' ? 'tool-button-accent-subtle' : ''"
              @click="setActiveTab('tree')"
            >
              <FolderOpen class="h-4 w-4" />
              <span>{{ t('sourceBrowser.treeTab') }}</span>
            </button>
            <button
              type="button"
              class="tool-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              :class="activeTab === 'search' ? 'tool-button-accent-subtle' : ''"
              @click="setActiveTab('search')"
            >
              <Search class="h-4 w-4" />
              <span>{{ t('sourceBrowser.searchTab') }}</span>
            </button>
            <div class="ml-auto flex h-8 w-8 items-center justify-center">
              <LoaderCircle v-if="currentLoading" class="theme-muted-text h-4 w-4 animate-spin" />
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div
            v-if="!sessionId"
            class="theme-empty-state px-3 py-4 text-xs"
          >
            {{ t('sourceBrowser.noProject') }}
          </div>

          <div
            v-else-if="currentError"
            class="theme-status-danger rounded-sm border px-3 py-3 text-xs"
          >
            {{ currentError }}
          </div>

          <div
            v-else-if="showSearchPromptState"
            class="theme-empty-state px-3 py-4 text-xs"
          >
            {{ t('sourceBrowser.searchPrompt') }}
          </div>

          <div
            v-else-if="showSearchEmptyState"
            class="theme-empty-state px-3 py-4 text-xs"
          >
            {{ t('sourceBrowser.searchEmpty') }}
          </div>

          <div
            v-else-if="showTreeEmptyState"
            class="theme-empty-state px-3 py-4 text-xs"
          >
            {{ t('sourceBrowser.treeEmpty') }}
          </div>

          <div
            v-else-if="currentLoading && !visibleItems.length"
            class="theme-empty-state px-3 py-4 text-xs"
          >
            {{ t('sourceBrowser.loadingFiles') }}
          </div>

          <div v-else-if="activeTab === 'search'" class="space-y-1">
            <div
              v-if="recentSearchItems.length"
              class="theme-muted-text px-1 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            >
              {{ t('sourceBrowser.recent') }}
            </div>
            <button
              v-for="item in recentSearchItems"
              :key="`recent-${item.path}`"
              :ref="(element) => setItemRef(item.path, element)"
              type="button"
              class="flex w-full items-start gap-2 rounded-sm border border-transparent px-2.5 py-2 text-left transition"
              :class="activeKey === item.path ? 'theme-list-item-active' : 'theme-list-item-hover'"
              @mouseenter="activeKey = item.path"
              @click="handleSelectItem(item)"
            >
              <component
                :is="item.type === 'directory' ? FolderOpen : File"
                class="theme-muted-text mt-0.5 h-4 w-4 shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div>
                  <span
                    class="truncate text-[13px] text-[var(--theme-textPrimary)]"
                    v-html="getHighlightedName(item)"
                  />
                </div>
                <div
                  class="theme-muted-text truncate font-mono text-[10px]"
                  v-html="getHighlightedPath(item)"
                />
              </div>
            </button>

            <div
              v-if="pickerProps.query.trim() && normalSearchItems.length"
              class="theme-muted-text px-1 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            >
              {{ t('sourceBrowser.results') }}
            </div>
            <button
              v-for="item in normalSearchItems"
              :key="`result-${item.path}`"
              :ref="(element) => setItemRef(item.path, element)"
              type="button"
              class="flex w-full items-start gap-2 rounded-sm border border-transparent px-2.5 py-2 text-left transition"
              :class="activeKey === item.path ? 'theme-list-item-active' : 'theme-list-item-hover'"
              @mouseenter="activeKey = item.path"
              @click="handleSelectItem(item)"
            >
              <component
                :is="item.type === 'directory' ? FolderOpen : File"
                class="theme-muted-text mt-0.5 h-4 w-4 shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div>
                  <span
                    class="truncate text-[13px] text-[var(--theme-textPrimary)]"
                    v-html="getHighlightedName(item)"
                  />
                </div>
                <div
                  class="theme-muted-text truncate font-mono text-[10px]"
                  v-html="getHighlightedPath(item)"
                />
              </div>
            </button>
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="item in treeItems"
              :key="item.path"
              :ref="(element) => setItemRef(item.path, element)"
              class="rounded-sm border border-transparent px-1.5 py-1 transition"
              :class="activeKey === item.path
                ? 'theme-list-item-active'
                : item.type === 'directory' && item.expanded
                  ? 'theme-list-item-expanded'
                  : 'theme-list-item-hover'"
              :style="{ paddingLeft: `${item.depth * 16 + 6}px` }"
              @mouseenter="activeKey = item.path"
            >
              <div class="flex items-start gap-1.5">
                <button
                  v-if="item.type === 'directory'"
                  type="button"
                  class="theme-icon-button h-5 w-5 shrink-0"
                  @click.stop="toggleDirectory(item.path)"
                >
                  <LoaderCircle v-if="item.loading" class="h-3.5 w-3.5 animate-spin" />
                  <ChevronRight v-else class="h-3.5 w-3.5 transition" :class="item.expanded ? 'rotate-90 text-[var(--theme-textPrimary)]' : ''" />
                </button>
                <span v-else class="block h-5 w-5 shrink-0" />

                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm px-0.5 py-0.5 text-left"
                  @click="handleSelectItem(item)"
                >
                  <component
                    :is="item.type === 'directory' ? FolderOpen : File"
                    class="h-4 w-4 shrink-0"
                    :class="item.type === 'directory' && item.expanded ? 'text-[var(--theme-textPrimary)]' : 'text-[var(--theme-textMuted)]'"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-[13px]"
                    :class="item.type === 'directory' ? 'font-medium text-[var(--theme-textPrimary)]' : 'text-[var(--theme-textPrimary)]'"
                  >
                    {{ getDisplayName(item) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="flex min-h-0 flex-col overflow-hidden">
        <div class="theme-divider border-b px-4 py-2">
          <p v-if="previewMetaLabel" class="theme-muted-text truncate text-[11px]">
            {{ previewMetaLabel }}
          </p>
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-4 py-3">
          <div
            v-if="previewLoading"
            class="theme-empty-state flex h-full min-h-[12rem] items-center justify-center text-sm"
          >
            <span>{{ t('sourceBrowser.previewLoading') }}</span>
          </div>

          <div
            v-else-if="previewError"
            class="theme-status-danger rounded-sm border px-4 py-3 text-sm"
          >
            {{ previewError }}
          </div>

          <div
            v-else-if="selectedItemType === 'directory'"
            class="theme-empty-state flex h-full min-h-[12rem] items-center justify-center text-sm"
          >
            {{ t('sourceBrowser.selectFileHint') }}
          </div>

          <div
            v-else-if="!selectedPath"
            class="theme-empty-state flex h-full min-h-[12rem] items-center justify-center text-sm"
          >
            {{ t('sourceBrowser.selectFile') }}
          </div>

          <div
            v-else-if="showImagePreview"
            class="source-browser-image-wrap flex min-h-[12rem] items-center justify-center rounded-sm border p-4"
          >
            <img
              :src="previewPayload.previewUrl"
              :alt="previewTitle"
              class="max-h-full max-w-full object-contain"
            >
          </div>

          <div
            v-else-if="showBinaryState"
            class="theme-empty-state flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-sm"
          >
            <FileImage class="h-8 w-8" />
            <span>{{ previewPayload?.tooLarge ? t('sourceBrowser.binaryTooLarge') : t('sourceBrowser.binaryUnsupported') }}</span>
          </div>

          <div
            v-else-if="showTextPreview"
            class="source-browser-code rounded-sm border"
            :style="{
              '--source-code-bg': previewCodeBg || 'var(--theme-panel)',
              '--source-code-fg': previewCodeFg || 'var(--theme-textPrimary)',
              '--source-code-gutter-width': previewGutterWidth,
            }"
          >
            <div class="source-code-view">
              <table class="source-code-view__table">
                <tbody v-html="previewCodeHtml" />
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </DialogShell>
</template>

<style scoped>
.source-browser-image-wrap {
  border-color: var(--theme-borderDefault);
  background: var(--theme-panel);
}

.source-browser-code {
  background: var(--source-code-bg);
  border-color: var(--theme-borderDefault);
  color: var(--source-code-fg);
  height: 100%;
  overflow: auto;
}

.source-code-view {
  min-width: max-content;
}

.source-code-view__table {
  border-collapse: separate;
  border-spacing: 0;
  color: inherit;
  font-family: var(--theme-fontMono);
  font-size: 0.82rem;
  line-height: 1.56;
  min-width: 100%;
  width: max-content;
}

.source-code-view :deep(.source-code-view__gutter) {
  border-right: 1px solid color-mix(in srgb, var(--theme-borderDefault) 82%, transparent);
  color: color-mix(in srgb, var(--source-code-fg) 50%, transparent);
  font-family: var(--theme-fontMono);
  font-size: 0.7rem;
  width: var(--source-code-gutter-width);
  min-width: var(--source-code-gutter-width);
  max-width: var(--source-code-gutter-width);
  padding: 0 0.38rem;
  text-align: right;
  user-select: none;
  vertical-align: top;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.source-code-view :deep(.source-code-view__code) {
  padding: 0 0.8rem;
  vertical-align: top;
  white-space: pre;
}

.source-code-view :deep(.source-code-view__line-inner) {
  display: block;
  min-height: 1.46em;
}
</style>
