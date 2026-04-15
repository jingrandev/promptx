<script setup>
import { Check, ChevronDown, Copy, FolderOpen, LoaderCircle, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../composables/useI18n.js'
import WorkbenchSelect from './WorkbenchSelect.vue'

const props = defineProps({
  busy: {
    type: Boolean,
    default: false,
  },
  agentEngines: {
    type: Array,
    default: () => [],
  },
  canEditEngine: {
    type: Boolean,
    default: true,
  },
  canEditCwd: {
    type: Boolean,
    default: true,
  },
  canEditSessionId: {
    type: Boolean,
    default: true,
  },
  cwd: {
    type: String,
    default: '',
  },
  cwdReadonlyMessage: {
    type: String,
    default: '',
  },
  duplicateCwdMessage: {
    type: String,
    default: '',
  },
  engine: {
    type: String,
    default: 'codex',
  },
  engineOptions: {
    type: Array,
    default: () => [],
  },
  engineReadonlyMessage: {
    type: String,
    default: '',
  },
  mobile: {
    type: Boolean,
    default: false,
  },
  sessionId: {
    type: String,
    default: '',
  },
  sessionIdCopied: {
    type: Boolean,
    default: false,
  },
  sessionIdReadonlyMessage: {
    type: String,
    default: '',
  },
  sessionCandidates: {
    type: Array,
    default: () => [],
  },
  sessionCandidatesLoading: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  workspaceSuggestions: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits([
  'copy-session-id',
  'open-directory-picker',
  'select-session-candidate',
  'update:agentEngines',
  'update:cwd',
  'update:engine',
  'update:sessionId',
  'update:title',
])
const { t } = useI18n()
const sessionComboboxRef = ref(null)
const sessionInputRef = ref(null)
const sessionDropdownOpen = ref(false)
const sessionActiveIndex = ref(-1)

const selectedEngineOption = computed(() => {
  const current = String(props.engine || '').trim()
  return props.engineOptions.find((item) => String(item?.value || '').trim() === current) || null
})
const normalizedAgentEngines = computed(() => {
  const values = Array.isArray(props.agentEngines) ? props.agentEngines : []
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
})
const collaborativeEngineOptions = computed(() => (
  props.engineOptions.filter((item) => String(item?.value || '').trim() !== String(props.engine || '').trim())
))
const hasSessionDirectory = computed(() => Boolean(String(props.cwd || '').trim()))
const normalizedSessionId = computed(() => String(props.sessionId || '').trim())
const normalizedSessionKeyword = computed(() => normalizedSessionId.value.toLowerCase())
const sameCwdSessionCandidates = computed(() => props.sessionCandidates.filter((candidate) => candidate?.matchedCwd))
const filteredSessionCandidates = computed(() => {
  const keyword = normalizedSessionKeyword.value
  const sourceItems = sameCwdSessionCandidates.value

  if (!keyword) {
    return sourceItems.slice(0, 10)
  }

  return sourceItems
    .filter((candidate) => {
      const haystacks = [
        candidate?.label,
        candidate?.id,
        candidate?.cwd,
      ]
        .map((value) => String(value || '').toLowerCase())
      return haystacks.some((value) => value.includes(keyword))
    })
    .slice(0, 10)
})

function openSessionDropdown() {
  if (props.busy || !props.canEditSessionId || !hasSessionDirectory.value) {
    return
  }
  sessionDropdownOpen.value = true
}

function closeSessionDropdown() {
  sessionDropdownOpen.value = false
  sessionActiveIndex.value = -1
}

function syncSessionActiveIndex() {
  const items = filteredSessionCandidates.value
  if (!items.length) {
    sessionActiveIndex.value = -1
    return
  }

  const currentIndex = items.findIndex((candidate) => candidate.id === normalizedSessionId.value)
  sessionActiveIndex.value = currentIndex >= 0 ? currentIndex : 0
}

function focusSessionInput() {
  nextTick(() => {
    sessionInputRef.value?.focus?.()
  })
}

function toggleSessionDropdown() {
  if (sessionDropdownOpen.value) {
    closeSessionDropdown()
    return
  }

  openSessionDropdown()
  focusSessionInput()
}

function clearCwd() {
  emit('update:cwd', '')
}

function toggleAgentEngine(engine) {
  if (!props.canEditEngine || props.busy) {
    return
  }

  const normalized = String(engine || '').trim()
  const nextItems = normalizedAgentEngines.value.includes(normalized)
    ? normalizedAgentEngines.value.filter((item) => item !== normalized)
    : [...normalizedAgentEngines.value, normalized]
  emit('update:agentEngines', nextItems)
}

function clearSessionId() {
  emit('update:sessionId', '')
  closeSessionDropdown()
  focusSessionInput()
}

function handleSessionInput(event) {
  emit('update:sessionId', event?.target?.value || '')
  if (hasSessionDirectory.value) {
    openSessionDropdown()
  }
}

function handleSessionCandidateSelect(candidate) {
  emit('select-session-candidate', candidate)
  closeSessionDropdown()
  focusSessionInput()
}

function handleSessionInputKeydown(event) {
  if (props.busy || !props.canEditSessionId || !hasSessionDirectory.value) {
    return
  }

  const items = filteredSessionCandidates.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!sessionDropdownOpen.value) {
      openSessionDropdown()
      syncSessionActiveIndex()
      return
    }
    if (!items.length) {
      return
    }
    sessionActiveIndex.value = sessionActiveIndex.value < 0
      ? 0
      : Math.min(items.length - 1, sessionActiveIndex.value + 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!sessionDropdownOpen.value) {
      openSessionDropdown()
      syncSessionActiveIndex()
      return
    }
    if (!items.length) {
      return
    }
    sessionActiveIndex.value = sessionActiveIndex.value < 0
      ? items.length - 1
      : Math.max(0, sessionActiveIndex.value - 1)
    return
  }

  if (event.key === 'Enter' && sessionDropdownOpen.value && items.length && sessionActiveIndex.value >= 0) {
    event.preventDefault()
    handleSessionCandidateSelect(items[sessionActiveIndex.value])
    return
  }

  if (event.key === 'Escape' && sessionDropdownOpen.value) {
    event.preventDefault()
    closeSessionDropdown()
  }
}

function handleDocumentPointerDown(event) {
  if (!sessionDropdownOpen.value || !sessionComboboxRef.value) {
    return
  }

  if (sessionComboboxRef.value.contains(event.target)) {
    return
  }

  closeSessionDropdown()
}

watch(filteredSessionCandidates, () => {
  syncSessionActiveIndex()
})

watch(
  () => props.canEditSessionId,
  (value) => {
    if (!value || !hasSessionDirectory.value) {
      closeSessionDropdown()
    }
  }
)

watch(hasSessionDirectory, (value) => {
  if (!value) {
    closeSessionDropdown()
  }
})

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<template>
  <div class="grid gap-4">
    <label class="theme-muted-text block text-xs">
      <span>{{ t('projectManager.projectTitleOptional') }}</span>
      <input
        :value="title"
        type="text"
        maxlength="140"
        placeholder=""
        class="tool-input mt-1"
        :disabled="busy"
        @input="emit('update:title', $event.target.value)"
      >
    </label>

    <label class="theme-muted-text block text-xs">
      <span>{{ t('projectManager.workingDirectoryField') }}</span>
      <div class="mt-1 flex gap-2">
        <div class="relative min-w-0 flex-1">
          <input
            :value="cwd"
            type="text"
            list="codex-manager-workspace-suggestions"
            placeholder=""
            class="tool-input min-w-0 w-full pr-9 disabled:cursor-not-allowed disabled:opacity-80"
            :class="duplicateCwdMessage ? 'border-[var(--theme-warning)]' : ''"
            :disabled="busy || !canEditCwd"
            @input="emit('update:cwd', $event.target.value)"
          >
          <button
            v-if="cwd && canEditCwd"
            type="button"
            class="theme-muted-text absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm transition hover:bg-[var(--theme-appPanelHover)] hover:text-[var(--theme-textPrimary)]"
            :disabled="busy"
            @click="clearCwd"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          class="tool-button inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs"
          :disabled="busy || !canEditCwd"
          @click="emit('open-directory-picker')"
        >
          <FolderOpen class="h-4 w-4" />
          <span>{{ mobile ? t('projectManager.choose') : t('projectManager.chooseDirectory') }}</span>
        </button>
      </div>
      <datalist id="codex-manager-workspace-suggestions">
        <option v-for="item in workspaceSuggestions" :key="item" :value="item" />
      </datalist>
      <p v-if="duplicateCwdMessage" class="mt-2 text-[11px] leading-5 text-[var(--theme-warningText)]">
        {{ duplicateCwdMessage }}
      </p>
      <p v-else-if="cwdReadonlyMessage" class="theme-muted-text mt-2 text-[11px] leading-5">
        {{ cwdReadonlyMessage }}
      </p>
    </label>

    <label class="theme-muted-text block text-xs">
      <span>{{ t('projectManager.engineField') }}</span>
      <div class="mt-1">
        <WorkbenchSelect
          :model-value="engine"
          :options="engineOptions"
          :disabled="busy || !canEditEngine"
          :placeholder="t('projectManager.selectEngine')"
          :empty-text="t('projectManager.noEngines')"
          :get-option-value="(item) => item?.value || ''"
          @update:model-value="emit('update:engine', $event)"
        >
          <template #trigger="{ disabled }">
            <div class="flex items-center gap-2 text-sm">
              <span
                class="min-w-0 flex-1 truncate"
                :class="disabled ? 'theme-muted-text' : 'text-[var(--theme-textPrimary)]'"
              >
                {{ selectedEngineOption?.label || t('projectManager.selectEngine') }}
              </span>
              <span
                v-if="selectedEngineOption && selectedEngineOption.enabled === false"
                class="theme-muted-text rounded-sm border border-dashed px-1.5 py-0.5 text-[10px]"
              >
                {{ t('projectManager.comingSoon') }}
              </span>
            </div>
          </template>

          <template #option="{ option, selected, select }">
            <button
              type="button"
              class="w-full rounded-sm border border-dashed px-3 py-2 text-left text-sm transition"
              :class="selected ? 'theme-filter-active' : 'theme-filter-idle'"
              :disabled="option?.enabled === false"
              @click="select"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                <span
                  v-if="option?.enabled === false"
                  class="theme-muted-text rounded-sm border border-dashed px-1.5 py-0.5 text-[10px]"
                >
                  {{ t('projectManager.comingSoon') }}
                </span>
              </div>
            </button>
          </template>
        </WorkbenchSelect>
      </div>
      <p v-if="engineReadonlyMessage" class="theme-muted-text mt-2 text-[11px] leading-5">
        {{ engineReadonlyMessage }}
      </p>
    </label>

    <div class="theme-muted-text block text-xs">
      <span>{{ t('projectManager.collaborationAgents') }}</span>
      <div class="mt-2 grid gap-2">
        <button
          v-for="option in collaborativeEngineOptions"
          :key="option.value"
          type="button"
          class="theme-list-row flex items-center justify-between gap-3 rounded-sm border border-solid px-3 py-2 text-left transition"
          :class="normalizedAgentEngines.includes(option.value) ? 'theme-list-item-active' : 'theme-list-item-hover'"
          :disabled="busy || !canEditEngine"
          @click="toggleAgentEngine(option.value)"
        >
          <div class="min-w-0">
            <div class="text-sm text-[var(--theme-textPrimary)]">{{ option.label }}</div>
            <div class="theme-muted-text mt-0.5 text-[11px] leading-5">
              {{ normalizedAgentEngines.includes(option.value) ? t('projectManager.agentEnabled') : t('projectManager.agentDisabled') }}
            </div>
          </div>
          <Check v-if="normalizedAgentEngines.includes(option.value)" class="h-4 w-4 shrink-0 text-[var(--theme-textPrimary)]" />
        </button>
      </div>
      <p class="theme-muted-text mt-2 text-[11px] leading-5">
        {{ t('projectManager.collaborationAgentsHint') }}
      </p>
    </div>

    <label class="theme-muted-text block text-xs">
      <span>{{ t('projectManager.sessionId') }}</span>
      <div class="mt-1 flex gap-2">
        <div ref="sessionComboboxRef" class="relative min-w-0 flex-1">
          <input
            ref="sessionInputRef"
            :value="sessionId"
            type="text"
            placeholder=""
            class="tool-input min-w-0 w-full pr-9 disabled:cursor-not-allowed disabled:opacity-80"
            :disabled="busy || !canEditSessionId"
            @focus="openSessionDropdown"
            @input="handleSessionInput"
            @keydown="handleSessionInputKeydown"
          >
          <button
            v-if="canEditSessionId"
            type="button"
            class="theme-muted-text absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm transition hover:bg-[var(--theme-appPanelHover)] hover:text-[var(--theme-textPrimary)]"
            :disabled="busy || !hasSessionDirectory"
            @click="toggleSessionDropdown"
          >
            <LoaderCircle v-if="sessionCandidatesLoading" class="h-3.5 w-3.5 animate-spin" />
            <X v-else-if="normalizedSessionId" class="h-3.5 w-3.5" @click.stop="clearSessionId" />
            <ChevronDown v-else class="h-3.5 w-3.5 transition" :class="sessionDropdownOpen ? 'rotate-180' : ''" />
          </button>

          <div
            v-if="canEditSessionId && sessionDropdownOpen"
            class="theme-popover theme-divider absolute left-0 right-0 top-[calc(100%+0.375rem)] z-20 overflow-hidden rounded-sm border border-solid shadow-sm"
          >
            <div class="flex items-center justify-between gap-2 border-b border-solid px-3 py-2 text-[11px] leading-5">
              <span class="font-medium text-[var(--theme-textPrimary)]">{{ t('projectManager.sessionCandidates') }}</span>
              <span v-if="sessionCandidatesLoading" class="theme-muted-text">{{ t('projectManager.sessionCandidatesLoading') }}</span>
            </div>
            <div v-if="filteredSessionCandidates.length" class="max-h-72 overflow-y-auto p-2">
              <button
                v-for="(candidate, index) in filteredSessionCandidates"
                :key="`${candidate.engine}:${candidate.id}`"
                type="button"
                class="theme-list-row mb-1 w-full px-2 py-1.5 text-left last:mb-0"
                :class="index === sessionActiveIndex ? 'theme-list-item-active' : 'theme-list-item-hover'"
                :disabled="busy"
                @mousedown.prevent
                @click="handleSessionCandidateSelect(candidate)"
              >
                <div class="flex min-w-0 items-center justify-between gap-3">
                  <span class="min-w-0 flex-1 truncate text-xs font-medium text-[var(--theme-textPrimary)]">
                    {{ candidate.label || candidate.id }}
                  </span>
                  <span class="shrink-0 text-[11px] leading-4 text-[var(--theme-textMuted)]">
                    {{ candidate.updatedAtLabel || t('projectManager.unknown') }}
                  </span>
                </div>
              </button>
            </div>

            <div v-else class="theme-empty-state px-3 py-4 text-xs">
              {{ hasSessionDirectory ? t('projectManager.noSessionCandidates') : t('projectManager.sessionCandidatesNeedDirectory') }}
            </div>
          </div>
        </div>
        <button
          v-if="normalizedSessionId"
          type="button"
          class="tool-button inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs"
          :disabled="busy"
          @click="emit('copy-session-id')"
        >
          <Check v-if="sessionIdCopied" class="h-4 w-4" />
          <Copy v-else class="h-4 w-4" />
          <span>{{ sessionIdCopied ? t('projectManager.sessionIdCopied') : t('projectManager.copySessionId') }}</span>
        </button>
      </div>
      <p v-if="sessionIdReadonlyMessage" class="theme-muted-text mt-2 text-[11px] leading-5">
        {{ sessionIdReadonlyMessage }}
      </p>
      <p v-else class="theme-muted-text mt-2 text-[11px] leading-5">
        {{ hasSessionDirectory ? t('projectManager.sessionIdHint') : t('projectManager.sessionCandidatesNeedDirectory') }}
      </p>
    </label>
  </div>
</template>
