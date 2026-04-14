<script setup>
const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  top: {
    type: Number,
    default: 0,
  },
  left: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['click'])
</script>

<template>
  <button
    type="button"
    class="tool-button tool-button-primary absolute z-20 inline-flex items-center gap-2 px-3 py-1.5 text-xs shadow-sm"
    :style="{ top: `${top}px`, left: `${left}px` }"
    @mousedown.prevent
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
