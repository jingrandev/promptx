<script setup>
import { computed } from 'vue'

const props = defineProps({
  frameClass: {
    type: String,
    default: '',
  },
  headerPaddingClass: {
    type: String,
    default: 'px-4 py-3',
  },
  headerClass: {
    type: String,
    default: '',
  },
  selected: {
    type: Boolean,
    default: false,
  },
})

const frameStateClass = computed(() => (
  props.selected
    ? 'ring-1 ring-inset ring-[var(--theme-borderStrong)]'
    : ''
))

const actionsStateClass = computed(() => (
  props.selected
    ? 'opacity-100'
    : 'opacity-100 sm:opacity-45 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
))
</script>

<template>
  <div
    class="overflow-hidden rounded-sm transition"
    :class="[frameClass, frameStateClass]"
  >
    <div class="theme-divider border-b text-xs" :class="[headerPaddingClass, headerClass]">
      <slot name="header" :actions-state-class="actionsStateClass" />
    </div>

    <slot />
  </div>
</template>
