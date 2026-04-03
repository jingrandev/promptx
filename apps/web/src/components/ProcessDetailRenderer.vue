<script setup>
defineOptions({
  name: 'ProcessDetailRenderer',
})

import { computed, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import { renderCodexMarkdown } from '../lib/codexMarkdown.js'
import { useI18n } from '../composables/useI18n.js'
import {
  createProcessDetailBlockKeyEntries,
  reconcileExpandedProcessDetailKeys,
} from '../lib/processDetailBlockKeys.js'

const CODE_TEXT_PREVIEW_LINES = 12
const CODE_LINES_PREVIEW_LIMIT = 10
const BUILD_ERROR_PREVIEW_LIMIT = 6
const SEARCH_FILE_PREVIEW_LIMIT = 2
const SEARCH_MATCH_PREVIEW_LIMIT = 3
const SUB_AGENT_MESSAGE_PREVIEW_LINES = 6

const props = defineProps({
  blocks: {
    type: Array,
    default: () => [],
  },
  kind: {
    type: String,
    default: '',
  },
  detail: {
    type: String,
    default: '',
  },
})

const { t } = useI18n()
const expandedBlockKeys = ref(new Set())
const expandedSubAgentMessageKeys = ref(new Set())

const normalizedBlocks = computed(() => {
  const blocks = Array.isArray(props.blocks) ? props.blocks.filter(Boolean) : []
  if (blocks.length) {
    return blocks
  }

  if (String(props.detail || '').trim()) {
    return [{ type: 'text', text: String(props.detail || '').trim() }]
  }

  return []
})

const blockKeyEntries = computed(() => createProcessDetailBlockKeyEntries(normalizedBlocks.value))
const blockKeys = computed(() => blockKeyEntries.value.map((entry) => entry.key))

watch(blockKeyEntries, (nextEntries, previousEntries = []) => {
  const nextExpanded = reconcileExpandedProcessDetailKeys(
    expandedBlockKeys.value,
    previousEntries,
    nextEntries
  )
  if (nextExpanded.size !== expandedBlockKeys.value.size) {
    expandedBlockKeys.value = nextExpanded
  }
}, { immediate: true })

watch(normalizedBlocks, (nextBlocks = []) => {
  const availableKeys = new Set()
  nextBlocks.forEach((block, blockIndex) => {
    if (block?.type !== 'sub_agent_list') {
      return
    }

    ;(Array.isArray(block.items) ? block.items : []).forEach((item, itemIndex) => {
      availableKeys.add(getSubAgentMessageKey(blockIndex, item, itemIndex))
    })
  })

  expandedSubAgentMessageKeys.value = new Set(
    [...expandedSubAgentMessageKeys.value].filter((key) => availableKeys.has(key))
  )
}, { immediate: true })

function renderMarkdown(text = '') {
  return renderCodexMarkdown(String(text || ''))
}

function formatChangeKind(kind = '') {
  const normalized = String(kind || '').trim()
  if (normalized === 'create') {
    return t('processDetail.changeCreate')
  }
  if (normalized === 'delete') {
    return t('processDetail.changeDelete')
  }
  if (normalized === 'update') {
    return t('processDetail.changeUpdate')
  }
  return t('processDetail.changeGeneric')
}

function isLongMetaValue(item = {}) {
  const label = String(item?.label || '').trim().toLowerCase()
  const value = String(item?.value || '').trim()
  if (!value) {
    return false
  }

  if (value.length > 56) {
    return true
  }

  if (['命令', 'command', '目标', 'target', 'url', '路径', 'path'].includes(label) && value.length > 28) {
    return true
  }

  return value.includes(' ') && value.length > 36
}

function shouldHideMetaLabel(item = {}, items = []) {
  const label = String(item?.label || '').trim().toLowerCase()
  if (!['命令', 'command'].includes(label)) {
    return false
  }

  return Array.isArray(items) && items.length === 1
}

function shouldUseMonoMetaValue(item = {}) {
  const label = String(item?.label || '').trim().toLowerCase()
  return ['命令', 'command', '路径', 'path', 'url', '目标', 'target'].includes(label)
}

function getChecklistItemStatus(item = {}) {
  if (item?.completed) {
    return 'completed'
  }

  const status = String(item?.status || '').trim().toLowerCase()
  if (status === 'in_progress') {
    return 'in_progress'
  }

  return 'pending'
}

function getSearchResultVisibleMatchCount(block = {}) {
  return (Array.isArray(block.files) ? block.files : []).reduce((sum, file) => (
    sum + (Array.isArray(file?.matches) ? file.matches.length : 0)
  ), 0)
}

function formatHiddenLines(count = 0) {
  return t('processDetail.hiddenLines', { count })
}

function formatHiddenItems(count = 0) {
  return t('processDetail.hiddenItems', { count })
}

function formatDirectorySummary(count = 0) {
  return t('processDetail.directorySummary', { count })
}

function formatDirectoryHidden(count = 0) {
  return t('processDetail.directoryHidden', { count })
}

function formatSearchMatchCount(count = 0) {
  return t('processDetail.searchMatchCount', { count })
}

function formatSearchFileSummary(fileCount = 0, matchCount = 0) {
  return t('processDetail.searchFileSummary', { fileCount, matchCount })
}

function formatSearchHiddenFiles(count = 0) {
  return t('processDetail.searchHiddenFiles', { count })
}

function formatSearchHiddenMatches(count = 0) {
  return t('processDetail.searchHiddenMatches', { count })
}

function getBlockKey(blockIndex = 0) {
  return blockKeys.value[blockIndex] || `block-${blockIndex}`
}

function isBlockExpanded(block = {}, blockIndex = 0) {
  return expandedBlockKeys.value.has(getBlockKey(blockIndex))
}

function toggleBlockExpanded(block = {}, blockIndex = 0) {
  const key = getBlockKey(blockIndex)
  const next = new Set(expandedBlockKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedBlockKeys.value = next
}

function getCodeTextLines(block = {}) {
  return String(block?.text || '').split('\n')
}

function getBlockPreviewLimit(block = {}) {
  if (block.type === 'code_text') {
    return CODE_TEXT_PREVIEW_LINES
  }
  if (block.type === 'build_error') {
    return BUILD_ERROR_PREVIEW_LIMIT
  }
  return CODE_LINES_PREVIEW_LIMIT
}

function getBlockItems(block = {}) {
  if (Array.isArray(block?.lines)) {
    return block.lines
  }
  if (Array.isArray(block?.items)) {
    return block.items
  }
  return []
}

function isBlockCollapsible(block = {}) {
  if (!block || typeof block !== 'object') {
    return false
  }

  if (block.type === 'code_text') {
    return getCodeTextLines(block).length > CODE_TEXT_PREVIEW_LINES
  }

  if (block.type === 'search_results') {
    const files = Array.isArray(block.files) ? block.files : []
    return (
      (block.fileCount || files.length) > SEARCH_FILE_PREVIEW_LIMIT
      || files.some((file) => (file?.totalCount || (Array.isArray(file?.matches) ? file.matches.length : 0)) > SEARCH_MATCH_PREVIEW_LIMIT)
    )
  }

  if (['code_snippet', 'numbered_lines', 'build_error'].includes(block.type)) {
    const items = getBlockItems(block)
    return (block.totalCount || items.length) > getBlockPreviewLimit(block)
  }

  return false
}

function getVisibleCodeText(block = {}, blockIndex = 0) {
  const lines = getCodeTextLines(block)
  if (isBlockExpanded(block, blockIndex) || lines.length <= CODE_TEXT_PREVIEW_LINES) {
    return String(block.text || '')
  }

  return `${lines.slice(0, CODE_TEXT_PREVIEW_LINES).join('\n')}\n...`
}

function getVisibleBlockItems(block = {}, blockIndex = 0) {
  const items = getBlockItems(block)
  if (isBlockExpanded(block, blockIndex)) {
    return items
  }

  return items.slice(0, getBlockPreviewLimit(block))
}

function getVisibleSearchFiles(block = {}, blockIndex = 0) {
  const files = Array.isArray(block.files) ? block.files : []
  if (isBlockExpanded(block, blockIndex)) {
    return files
  }

  return files.slice(0, SEARCH_FILE_PREVIEW_LIMIT).map((file) => ({
    ...file,
    matches: (Array.isArray(file?.matches) ? file.matches : []).slice(0, SEARCH_MATCH_PREVIEW_LIMIT),
  }))
}

function getCollapsedHiddenCount(block = {}, blockIndex = 0) {
  if (block.type === 'code_text') {
    return Math.max(0, getCodeTextLines(block).length - (isBlockExpanded(block, blockIndex) ? getCodeTextLines(block).length : CODE_TEXT_PREVIEW_LINES))
  }

  const items = getBlockItems(block)
  const totalCount = block.totalCount || items.length
  return Math.max(0, totalCount - getVisibleBlockItems(block, blockIndex).length)
}

function getSearchHiddenFileCount(block = {}, blockIndex = 0) {
  const files = Array.isArray(block.files) ? block.files : []
  const visibleCount = getVisibleSearchFiles(block, blockIndex).length
  return Math.max(0, (block.fileCount || files.length) - visibleCount)
}

function getSearchHiddenMatchCount(file = {}, block = {}, blockIndex = 0) {
  const visibleMatches = Array.isArray(file?.matches) ? file.matches.length : 0
  return Math.max(0, (file?.totalCount || visibleMatches) - visibleMatches)
}

function formatSubAgentStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') {
    return t('processDetail.subAgentCompleted')
  }
  if (normalized === 'failed') {
    return t('processDetail.subAgentFailed')
  }
  if (normalized === 'running') {
    return t('processDetail.subAgentRunning')
  }
  if (normalized === 'pending_init') {
    return t('processDetail.subAgentPending')
  }
  return t('processDetail.subAgentUnknown')
}

function getSubAgentStatusClass(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') {
    return 'theme-status-success'
  }
  if (normalized === 'failed') {
    return 'theme-status-danger'
  }
  if (normalized === 'running') {
    return 'theme-status-info'
  }
  return 'theme-status-neutral'
}

function getSubAgentMessageKey(blockIndex = 0, item = {}, itemIndex = 0) {
  return `${getBlockKey(blockIndex)}:sub-agent:${String(item?.id || item?.target || item?.title || itemIndex)}`
}

function getSubAgentMessageLines(item = {}) {
  return String(item?.message || '').split('\n')
}

function isSubAgentMessageExpanded(blockIndex = 0, item = {}, itemIndex = 0) {
  return expandedSubAgentMessageKeys.value.has(getSubAgentMessageKey(blockIndex, item, itemIndex))
}

function toggleSubAgentMessage(blockIndex = 0, item = {}, itemIndex = 0) {
  const key = getSubAgentMessageKey(blockIndex, item, itemIndex)
  const next = new Set(expandedSubAgentMessageKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedSubAgentMessageKeys.value = next
}

function isSubAgentMessageCollapsible(item = {}) {
  const lines = getSubAgentMessageLines(item)
  return lines.length > SUB_AGENT_MESSAGE_PREVIEW_LINES
}

function getVisibleSubAgentMessage(item = {}, blockIndex = 0, itemIndex = 0) {
  const message = String(item?.message || '')
  const lines = getSubAgentMessageLines(item)
  if (!message || isSubAgentMessageExpanded(blockIndex, item, itemIndex) || lines.length <= SUB_AGENT_MESSAGE_PREVIEW_LINES) {
    return message
  }

  return `${lines.slice(0, SUB_AGENT_MESSAGE_PREVIEW_LINES).join('\n')}\n...`
}

function getSubAgentMessageHiddenLineCount(item = {}, blockIndex = 0, itemIndex = 0) {
  const lines = getSubAgentMessageLines(item)
  if (isSubAgentMessageExpanded(blockIndex, item, itemIndex)) {
    return 0
  }
  return Math.max(0, lines.length - SUB_AGENT_MESSAGE_PREVIEW_LINES)
}

function getSubAgentMessageBlocks(item = {}) {
  return Array.isArray(item?.messageBlocks) ? item.messageBlocks.filter(Boolean) : []
}

function hasStructuredSubAgentMessage(item = {}) {
  const blocks = getSubAgentMessageBlocks(item)
  return blocks.some((block) => !['text', 'markdown'].includes(String(block?.type || '').trim()))
}

function shouldRenderSubAgentMessageBlocks(item = {}, blockIndex = 0, itemIndex = 0) {
  if (!String(item?.message || '').trim()) {
    return false
  }

  const expanded = isSubAgentMessageExpanded(blockIndex, item, itemIndex)
  if (expanded) {
    return getSubAgentMessageBlocks(item).length > 0
  }

  return hasStructuredSubAgentMessage(item) && !isSubAgentMessageCollapsible(item)
}
</script>

<template>
  <div v-if="normalizedBlocks.length" class="process-detail space-y-2">
    <template v-for="(block, blockIndex) in normalizedBlocks" :key="blockKeys[blockIndex] || `${block.type}-${blockIndex}`">
      <div v-if="block.type === 'meta'" class="process-detail-meta">
        <div
          v-for="(item, itemIndex) in block.items || []"
          :key="`${blockIndex}-meta-${itemIndex}`"
          class="process-detail-meta__item"
          :class="{
            'process-detail-meta__item--long': isLongMetaValue(item),
            'process-detail-meta__item--value-only': shouldHideMetaLabel(item, block.items),
          }"
        >
          <span v-if="!shouldHideMetaLabel(item, block.items)" class="process-detail-meta__label">{{ item.label }}</span>
          <span
            class="process-detail-meta__value"
            :class="{
              'process-detail-mobile-code-scroll': isLongMetaValue(item),
              'process-detail-meta__value--mono': shouldUseMonoMetaValue(item),
            }"
          >
            {{ item.value }}
          </span>
        </div>
      </div>

      <div v-else-if="block.type === 'checklist'" class="process-detail-panel">
        <div class="space-y-1.5">
          <div
            v-for="(item, itemIndex) in block.items || []"
            :key="`${blockIndex}-check-${itemIndex}`"
            class="process-detail-checklist__item"
          >
            <span
              class="process-detail-checklist__icon"
              :class="`is-${getChecklistItemStatus(item)}`"
            >
              <Check v-if="getChecklistItemStatus(item) === 'completed'" class="h-3 w-3" />
              <span v-else-if="getChecklistItemStatus(item) === 'in_progress'" class="process-detail-checklist__dot" />
            </span>
            <span :class="getChecklistItemStatus(item) === 'completed' ? 'line-through opacity-65' : ''">{{ item.text }}</span>
          </div>
        </div>
        <div v-if="block.totalCount" class="process-detail-footnote">
          {{ `已完成 ${(block.items || []).filter((item) => item.completed).length} / ${block.totalCount}` }}
          <span v-if="block.hiddenCount">{{ `，还有 ${block.hiddenCount} 项` }}</span>
        </div>
      </div>

      <div v-else-if="block.type === 'directory_list'" class="process-detail-panel">
        <div class="process-detail-directory__heading">
          <span v-if="block.path" class="font-medium">{{ block.path }}</span>
          <span v-if="block.entryType" class="process-detail-directory__type">{{ block.entryType }}</span>
        </div>
        <div class="process-detail-directory__list">
          <div
            v-for="(entry, entryIndex) in block.entries || []"
            :key="`${blockIndex}-entry-${entryIndex}`"
            class="process-detail-directory__item"
          >
            {{ entry }}
          </div>
        </div>
        <div v-if="block.totalCount" class="process-detail-footnote">
          {{ formatDirectorySummary(block.totalCount) }}
          <span v-if="block.hiddenCount">{{ formatDirectoryHidden(block.hiddenCount) }}</span>
        </div>
      </div>

      <div v-else-if="block.type === 'build_error'" class="process-detail-build">
        <div class="process-detail-build__header">
          <div class="process-detail-build__title">
            {{ block.summary || block.title || 'Build failed' }}
          </div>
          <div class="process-detail-build__badges">
            <span v-if="block.errorCode" class="process-detail-build__badge">{{ block.errorCode }}</span>
            <span v-if="block.location" class="process-detail-build__badge">
              {{ `${block.location.line}:${block.location.column}` }}
            </span>
          </div>
        </div>
        <div v-if="block.location?.path" class="process-detail-build__path process-detail-mobile-code-scroll">
          {{ block.location.path }}
        </div>
        <div v-if="block.lines?.length" class="process-detail-code process-detail-code--tight">
          <div
            v-for="(line, lineIndex) in getVisibleBlockItems(block, blockIndex)"
            :key="`${blockIndex}-build-${lineIndex}`"
            class="process-detail-code__line"
          >
            <span class="process-detail-code__gutter">{{ line.number }}</span>
            <span class="process-detail-code__content">{{ line.content || ' ' }}</span>
          </div>
        </div>
        <div v-if="getCollapsedHiddenCount(block, blockIndex) || isBlockCollapsible(block)" class="process-detail-footnote">
          <span v-if="getCollapsedHiddenCount(block, blockIndex)">{{ formatHiddenLines(getCollapsedHiddenCount(block, blockIndex)) }}</span>
          <button
            v-if="isBlockCollapsible(block)"
            type="button"
            class="process-detail-footnote__toggle"
            @click="toggleBlockExpanded(block, blockIndex)"
          >
            {{ isBlockExpanded(block, blockIndex) ? t('common.collapse') : t('common.expand') }}
          </button>
        </div>
      </div>

      <div v-else-if="block.type === 'search_results'" class="space-y-2">
        <div
          v-for="(file, fileIndex) in getVisibleSearchFiles(block, blockIndex)"
          :key="`${blockIndex}-search-${fileIndex}`"
          class="process-detail-search__file"
        >
          <div class="process-detail-search__file-header">
            <span class="process-detail-search__file-path process-detail-mobile-code-scroll">{{ file.path }}</span>
            <span class="process-detail-search__file-badge">{{ formatSearchMatchCount(file.totalCount) }}</span>
          </div>
          <div class="process-detail-search__matches">
            <div
              v-for="(line, lineIndex) in file.matches || []"
              :key="`${blockIndex}-search-${fileIndex}-${lineIndex}`"
              class="process-detail-code__line"
            >
              <span class="process-detail-code__gutter">{{ line.number }}</span>
              <span class="process-detail-code__content">{{ line.content || ' ' }}</span>
            </div>
          </div>
          <div v-if="getSearchHiddenMatchCount(file, block, blockIndex)" class="process-detail-footnote process-detail-footnote--compact">
            {{ formatSearchHiddenMatches(getSearchHiddenMatchCount(file, block, blockIndex)) }}
          </div>
        </div>
        <div class="process-detail-footnote">
          {{ formatSearchFileSummary(block.fileCount || 0, block.totalCount || getSearchResultVisibleMatchCount(block)) }}
          <span v-if="getSearchHiddenFileCount(block, blockIndex)">{{ formatSearchHiddenFiles(getSearchHiddenFileCount(block, blockIndex)) }}</span>
          <button
            v-if="isBlockCollapsible(block)"
            type="button"
            class="process-detail-footnote__toggle"
            @click="toggleBlockExpanded(block, blockIndex)"
          >
            {{ isBlockExpanded(block, blockIndex) ? t('common.collapse') : t('common.expand') }}
          </button>
        </div>
      </div>

      <div v-else-if="block.type === 'code_snippet'" class="process-detail-code">
        <div
          v-for="(line, lineIndex) in getVisibleBlockItems(block, blockIndex)"
          :key="`${blockIndex}-code-${lineIndex}`"
          class="process-detail-code__line"
        >
          <span class="process-detail-code__gutter">{{ line.number }}</span>
          <span class="process-detail-code__content">{{ line.content }}</span>
        </div>
        <div v-if="getCollapsedHiddenCount(block, blockIndex) || isBlockCollapsible(block)" class="process-detail-footnote">
          <span v-if="getCollapsedHiddenCount(block, blockIndex)">{{ formatHiddenLines(getCollapsedHiddenCount(block, blockIndex)) }}</span>
          <button
            v-if="isBlockCollapsible(block)"
            type="button"
            class="process-detail-footnote__toggle"
            @click="toggleBlockExpanded(block, blockIndex)"
          >
            {{ isBlockExpanded(block, blockIndex) ? t('common.collapse') : t('common.expand') }}
          </button>
        </div>
      </div>

      <div v-else-if="block.type === 'code_text'" class="space-y-1.5">
        <pre class="process-detail-code process-detail-code__text">{{ getVisibleCodeText(block, blockIndex) }}</pre>
        <div v-if="getCollapsedHiddenCount(block, blockIndex) || isBlockCollapsible(block)" class="process-detail-footnote">
          <span v-if="getCollapsedHiddenCount(block, blockIndex)">{{ formatHiddenLines(getCollapsedHiddenCount(block, blockIndex)) }}</span>
          <button
            v-if="isBlockCollapsible(block)"
            type="button"
            class="process-detail-footnote__toggle"
            @click="toggleBlockExpanded(block, blockIndex)"
          >
            {{ isBlockExpanded(block, blockIndex) ? t('common.collapse') : t('common.expand') }}
          </button>
        </div>
      </div>

      <div v-else-if="block.type === 'numbered_lines'" class="process-detail-code">
        <div
          v-for="(item, itemIndex) in getVisibleBlockItems(block, blockIndex)"
          :key="`${blockIndex}-numbered-${itemIndex}`"
          class="process-detail-code__line"
        >
          <span class="process-detail-code__gutter">{{ item.number }}</span>
          <span class="process-detail-code__content">{{ item.content || ' ' }}</span>
        </div>
        <div v-if="getCollapsedHiddenCount(block, blockIndex) || isBlockCollapsible(block)" class="process-detail-footnote">
          <span v-if="getCollapsedHiddenCount(block, blockIndex)">{{ formatHiddenLines(getCollapsedHiddenCount(block, blockIndex)) }}</span>
          <button
            v-if="isBlockCollapsible(block)"
            type="button"
            class="process-detail-footnote__toggle"
            @click="toggleBlockExpanded(block, blockIndex)"
          >
            {{ isBlockExpanded(block, blockIndex) ? t('common.collapse') : t('common.expand') }}
          </button>
        </div>
      </div>

      <div v-else-if="block.type === 'bullet_list'" class="process-detail-panel">
        <ul class="list-disc space-y-1.5 pl-5">
          <li v-for="(item, itemIndex) in block.items || []" :key="`${blockIndex}-bullet-${itemIndex}`">{{ item }}</li>
        </ul>
        <div v-if="block.hiddenCount" class="process-detail-footnote">{{ formatHiddenItems(block.hiddenCount) }}</div>
      </div>

      <div v-else-if="block.type === 'file_changes'" class="process-detail-panel">
        <div class="space-y-1.5">
          <div
            v-for="(item, itemIndex) in block.items || []"
            :key="`${blockIndex}-change-${itemIndex}`"
            class="process-detail-filechange__item"
          >
            <span class="process-detail-filechange__kind">{{ formatChangeKind(item.kind) }}</span>
            <span class="process-detail-filechange__path process-detail-mobile-code-scroll">{{ item.path }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="block.type === 'sub_agent_list'" class="process-detail-panel">
        <div class="space-y-2">
          <div
            v-for="(item, itemIndex) in block.items || []"
            :key="`${blockIndex}-sub-agent-${itemIndex}`"
            class="rounded-sm border border-dashed border-[var(--theme-borderSubtle)] px-3 py-2"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 space-y-1">
                <div class="font-medium text-[var(--theme-textPrimary)]">
                  {{ item.title || item.target || item.id }}
                </div>
                <div class="theme-muted-text flex flex-wrap items-center gap-2 text-[11px]">
                  <span v-if="item.role" class="rounded-sm border border-dashed px-1.5 py-0.5">{{ item.role }}</span>
                  <span v-if="item.target" class="font-mono">{{ item.target }}</span>
                  <span v-if="item.model" class="font-mono">{{ item.model }}</span>
                  <span v-if="item.id && item.id !== item.target" class="font-mono opacity-80">{{ item.id }}</span>
                </div>
              </div>
              <span
                class="inline-flex items-center rounded-sm border border-dashed px-2 py-0.5 text-[10px]"
                :class="getSubAgentStatusClass(item.status)"
              >
                {{ formatSubAgentStatus(item.status) }}
              </span>
            </div>
            <div v-if="item.message" class="mt-2 space-y-1.5">
              <ProcessDetailRenderer
                v-if="shouldRenderSubAgentMessageBlocks(item, blockIndex, itemIndex)"
                :blocks="getSubAgentMessageBlocks(item)"
                kind="sub-agent-message"
              />
              <pre
                v-else
                class="theme-muted-text whitespace-pre-wrap break-words text-xs leading-5"
              >{{ getVisibleSubAgentMessage(item, blockIndex, itemIndex) }}</pre>
              <div
                v-if="getSubAgentMessageHiddenLineCount(item, blockIndex, itemIndex) || isSubAgentMessageCollapsible(item)"
                class="process-detail-footnote process-detail-footnote--compact"
              >
                <span v-if="getSubAgentMessageHiddenLineCount(item, blockIndex, itemIndex)">
                  {{ formatHiddenLines(getSubAgentMessageHiddenLineCount(item, blockIndex, itemIndex)) }}
                </span>
                <button
                  v-if="isSubAgentMessageCollapsible(item)"
                  type="button"
                  class="process-detail-footnote__toggle"
                  @click="toggleSubAgentMessage(blockIndex, item, itemIndex)"
                >
                  {{ isSubAgentMessageExpanded(blockIndex, item, itemIndex) ? t('common.collapse') : t('common.expand') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="block.type === 'markdown'"
        class="codex-markdown process-detail-markdown"
        :class="{ 'process-detail-markdown--reasoning': props.kind === 'reasoning' }"
        v-html="renderMarkdown(block.text)"
      />

      <pre v-else class="process-detail-text">{{ block.text }}</pre>
    </template>
  </div>
</template>
