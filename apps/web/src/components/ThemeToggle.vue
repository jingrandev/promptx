<script setup>
import { useTheme } from '../composables/useTheme.js'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button class="tool-button px-3 py-2 text-xs" type="button" @click="toggleTheme">
    {{ isDark ? '浅色模式' : '深色模式' }}
  </button>
</template>
