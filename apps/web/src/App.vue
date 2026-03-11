<script setup>
import ThemeToggle from './components/ThemeToggle.vue'
</script>

<template>
  <div class="min-h-full bg-stone-100 text-stone-900 transition-colors dark:bg-stone-950 dark:text-stone-100">
    <header class="border-b border-stone-300 bg-stone-100/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <RouterLink to="/" class="font-mono text-sm font-medium uppercase tracking-[0.2em] text-stone-600 dark:text-stone-400">
          TmpPrompt
        </RouterLink>
        <ThemeToggle />
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
</template>
