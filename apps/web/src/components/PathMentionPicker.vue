<script setup>
import { ref } from 'vue'
import {
  ChevronRight,
  File,
  FolderOpen,
  LoaderCircle,
  Search,
  X,
} from 'lucide-vue-next'
import { useWorkspaceTree } from '../composables/useWorkspaceTree.js'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  sessionId: {
    type: String,
    default: '',
  },
  query: {
    type: String,
    default: '',
  },
  anchorRect: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'select'])
const panelRef = ref(null)

const {
  activeKey,
  activeTab,
  closePicker,
  collapseActiveDirectory,
  confirmActive,
  currentError,
  currentLoading,
  emitSelect,
  expandActiveDirectory,
  getDisplayName,
  getHighlightedName,
  getHighlightedPath,
  moveActive,
  normalSearchItems,
  normalizedQuery,
  panelReady,
  panelStyle,
  recentSearchItems,
  setActiveTab,
  setItemRef,
  showSearchEmptyState,
  showSearchPromptState,
  showTreeEmptyState,
  switchTab,
  toggleDirectory,
  treeItems,
  visibleItems,
} = useWorkspaceTree({
  props,
  panelRef,
  onClose: () => emit('close'),
  onSelect: (item) => emit('select', item),
})

defineExpose({
  collapseActiveDirectory,
  moveActive,
  confirmActive,
  expandActiveDirectory,
  switchTab,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && panelReady"
      ref="panelRef"
      class="fixed z-40 flex flex-col overflow-hidden rounded-sm border border-stone-300 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-950"
      :style="panelStyle"
    >
      <div class="flex items-center justify-between gap-2 border-b border-dashed border-stone-300 px-2.5 py-2 dark:border-stone-700">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] transition"
            :class="activeTab === 'search'
              ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
              : 'border-dashed border-stone-300 text-stone-600 hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-500 dark:hover:text-stone-100'"
            @click="setActiveTab('search')"
          >
            <Search class="h-3.5 w-3.5" />
            <span>搜索</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] transition"
            :class="activeTab === 'tree'
              ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
              : 'border-dashed border-stone-300 text-stone-600 hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-500 dark:hover:text-stone-100'"
            @click="setActiveTab('tree')"
          >
            <FolderOpen class="h-3.5 w-3.5" />
            <span>文件树</span>
          </button>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <div
            class="inline-flex h-7 w-7 items-center justify-center text-stone-500 dark:text-stone-400"
            :class="currentLoading ? 'opacity-100' : 'opacity-0'"
          >
            <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
          </div>
          <button
            type="button"
            class="tool-button inline-flex h-7 w-7 items-center justify-center"
            @click="closePicker"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div
          v-if="!sessionId"
          class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
        >
          请先选择会话。
        </div>

        <div
          v-else-if="currentError"
          class="rounded-sm border border-dashed border-red-300 bg-red-50 px-3 py-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        >
          {{ currentError }}
        </div>

        <div
          v-else-if="showSearchPromptState"
          class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
        >
          输入关键词开始搜索。
        </div>

        <div
          v-else-if="showSearchEmptyState"
          class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
        >
          无结果
        </div>

        <div
          v-else-if="showTreeEmptyState"
          class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
        >
          空目录
        </div>

        <div
          v-else-if="currentLoading && !visibleItems.length"
          class="rounded-sm border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
        >
          加载中...
        </div>

        <div v-else-if="activeTab === 'search'" class="space-y-1">
          <div
            v-if="recentSearchItems.length"
            class="px-1 py-0.5 text-[10px] uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500"
          >
            最近
          </div>
          <button
            v-for="item in recentSearchItems"
            :key="item.path"
            :ref="(element) => setItemRef(item.path, element)"
            type="button"
            class="flex w-full items-start gap-2 rounded-sm border border-transparent px-2.5 py-1.5 text-left transition"
            :class="activeKey === item.path
              ? 'bg-stone-100 dark:bg-stone-900'
              : 'hover:bg-stone-50 dark:hover:bg-stone-900'"
            @mouseenter="activeKey = item.path"
            @click="emitSelect(item)"
          >
            <component
              :is="item.type === 'directory' ? FolderOpen : File"
              class="mt-0.5 h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400"
            />
            <div class="min-w-0 flex-1">
              <div>
                <span
                  class="truncate text-[13px] text-stone-900 dark:text-stone-100"
                  v-html="getHighlightedName(item)"
                />
              </div>
              <div
                class="truncate font-mono text-[10px] text-stone-500 dark:text-stone-400"
                v-html="getHighlightedPath(item)"
              />
            </div>
          </button>
          <div
            v-if="normalizedQuery && normalSearchItems.length"
            class="px-1 py-0.5 text-[10px] uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500"
          >
            结果
          </div>
          <button
            v-for="item in normalSearchItems"
            :key="item.path"
            :ref="(element) => setItemRef(item.path, element)"
            type="button"
            class="flex w-full items-start gap-2 rounded-sm border border-transparent px-2.5 py-1.5 text-left transition"
            :class="activeKey === item.path
              ? 'bg-stone-100 dark:bg-stone-900'
              : 'hover:bg-stone-50 dark:hover:bg-stone-900'"
            @mouseenter="activeKey = item.path"
            @click="emitSelect(item)"
          >
            <component
              :is="item.type === 'directory' ? FolderOpen : File"
              class="mt-0.5 h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400"
            />
            <div class="min-w-0 flex-1">
              <div>
                <span
                  class="truncate text-[13px] text-stone-900 dark:text-stone-100"
                  v-html="getHighlightedName(item)"
                />
              </div>
              <div
                class="truncate font-mono text-[10px] text-stone-500 dark:text-stone-400"
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
              ? 'bg-stone-100 dark:bg-stone-900'
              : item.type === 'directory' && item.expanded
                ? 'bg-stone-50 dark:bg-stone-900/70'
                : 'hover:bg-stone-50 dark:hover:bg-stone-900'"
            :style="{ paddingLeft: `${item.depth * 16 + 6}px` }"
            @mouseenter="activeKey = item.path"
          >
            <div class="flex items-start gap-1.5">
              <button
                v-if="item.type === 'directory'"
                type="button"
                class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-stone-500 transition hover:bg-stone-200 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                @click.stop="toggleDirectory(item.path)"
              >
                <LoaderCircle v-if="item.loading" class="h-3.5 w-3.5 animate-spin" />
                <ChevronRight v-else class="h-3.5 w-3.5 transition" :class="item.expanded ? 'rotate-90 text-stone-900 dark:text-stone-100' : ''" />
              </button>
              <span v-else class="block h-5 w-5 shrink-0" />

              <button
                type="button"
                class="flex min-w-0 flex-1 items-start gap-1.5 rounded-sm px-0.5 py-0.5 text-left"
                @click="emitSelect(item)"
              >
                <component
                  :is="item.type === 'directory' ? FolderOpen : File"
                  class="h-4 w-4 shrink-0"
                  :class="item.type === 'directory' && item.expanded ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="truncate text-[13px]"
                      :class="item.type === 'directory' ? 'font-medium text-stone-900 dark:text-stone-100' : 'text-stone-800 dark:text-stone-100'"
                    >
                      {{ getDisplayName(item) }}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
