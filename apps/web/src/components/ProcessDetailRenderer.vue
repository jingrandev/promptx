<script setup>
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { renderCodexMarkdown } from '../lib/codexMarkdown.js'

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

function renderMarkdown(text = '') {
  return renderCodexMarkdown(String(text || ''))
}

function formatChangeKind(kind = '') {
  const normalized = String(kind || '').trim()
  if (normalized === 'create') {
    return '新增'
  }
  if (normalized === 'delete') {
    return '删除'
  }
  if (normalized === 'update') {
    return '更新'
  }
  return '变更'
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
</script>

<template>
  <div v-if="normalizedBlocks.length" class="process-detail space-y-2">
    <template v-for="(block, blockIndex) in normalizedBlocks" :key="`${block.type}-${blockIndex}`">
      <div v-if="block.type === 'meta'" class="process-detail-meta">
        <div
          v-for="(item, itemIndex) in block.items || []"
          :key="`${blockIndex}-meta-${itemIndex}`"
          class="process-detail-meta__item"
          :class="{ 'process-detail-meta__item--long': isLongMetaValue(item) }"
        >
          <span class="process-detail-meta__label">{{ item.label }}</span>
          <span class="process-detail-meta__value">{{ item.value }}</span>
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
          {{ `${block.totalCount} 项` }}
          <span v-if="block.hiddenCount">{{ `，还有 ${block.hiddenCount} 项未展示` }}</span>
        </div>
      </div>

      <div v-else-if="block.type === 'code_snippet'" class="process-detail-code">
        <div
          v-for="(line, lineIndex) in block.lines || []"
          :key="`${blockIndex}-code-${lineIndex}`"
          class="process-detail-code__line"
        >
          <span class="process-detail-code__gutter">{{ line.number }}</span>
          <span class="process-detail-code__content">{{ line.content }}</span>
        </div>
        <div v-if="block.hiddenCount" class="process-detail-footnote">{{ `还有 ${block.hiddenCount} 行未展示` }}</div>
      </div>

      <div v-else-if="block.type === 'numbered_lines'" class="process-detail-panel">
        <div
          v-for="(item, itemIndex) in block.items || []"
          :key="`${blockIndex}-numbered-${itemIndex}`"
          class="process-detail-code__line"
        >
          <span class="process-detail-code__gutter">{{ item.number }}</span>
          <span class="process-detail-code__content process-detail-code__content--soft">{{ item.content || ' ' }}</span>
        </div>
        <div v-if="block.hiddenCount" class="process-detail-footnote">{{ `还有 ${block.hiddenCount} 行未展示` }}</div>
      </div>

      <div v-else-if="block.type === 'bullet_list'" class="process-detail-panel">
        <ul class="list-disc space-y-1.5 pl-5">
          <li v-for="(item, itemIndex) in block.items || []" :key="`${blockIndex}-bullet-${itemIndex}`">{{ item }}</li>
        </ul>
        <div v-if="block.hiddenCount" class="process-detail-footnote">{{ `还有 ${block.hiddenCount} 项未展示` }}</div>
      </div>

      <div v-else-if="block.type === 'file_changes'" class="process-detail-panel">
        <div class="space-y-1.5">
          <div
            v-for="(item, itemIndex) in block.items || []"
            :key="`${blockIndex}-change-${itemIndex}`"
            class="process-detail-filechange__item"
          >
            <span class="process-detail-filechange__kind">{{ formatChangeKind(item.kind) }}</span>
            <span class="font-mono text-[11px] leading-5">{{ item.path }}</span>
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
