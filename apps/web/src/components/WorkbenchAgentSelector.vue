<script setup>
import { computed } from 'vue'
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
  align: {
    type: String,
    default: 'start',
  },
})

const emit = defineEmits(['update:selectedAgentEngine'])

const { t } = useI18n()

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

const showSelector = computed(() => agentOptions.value.length > 1)

const selectedAgentEngineValue = computed(() => {
  const selected = String(props.selectedAgentEngine || '').trim()
  if (agentOptions.value.some((item) => item.engine === selected)) {
    return selected
  }

  return agentOptions.value.find((item) => item.isDefault)?.engine || agentOptions.value[0]?.engine || ''
})

const containerClass = computed(() => (
  props.align === 'end'
    ? 'sm:justify-end'
    : props.align === 'center'
      ? 'sm:justify-center'
      : 'sm:justify-start'
))

function getAgentOptionLabel(item = {}) {
  return formatAgentBindingLabel(item, {
    prefix: '→ ',
    defaultLabel: t('sessionPanel.defaultAgent'),
  })
}
</script>

<template>
  <div
    v-if="showSelector"
    class="flex w-full overflow-x-auto pb-0.5"
    :class="containerClass"
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
</template>
