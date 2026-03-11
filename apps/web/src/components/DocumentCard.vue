<script setup>
defineProps({
  item: {
    type: Object,
    required: true,
  },
  editable: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <article class="panel flex flex-col gap-4 p-4">
    <div>
      <h3 class="text-base font-semibold text-stone-900 dark:text-stone-100">{{ item.title || '未命名文档' }}</h3>
      <p class="mt-1 font-mono text-xs text-stone-500 dark:text-stone-400">/{{ item.slug }}</p>
    </div>

    <p class="min-h-10 text-sm leading-6 text-stone-700 dark:text-stone-300">{{ item.preview || '还没有正文内容，可以继续补需求说明、截图说明或操作步骤。' }}</p>

    <div class="text-xs text-stone-500 dark:text-stone-400">
      {{ new Date(item.updatedAt).toLocaleString('zh-CN') }}
    </div>

    <div class="flex flex-wrap gap-2">
      <RouterLink :to="`/p/${item.slug}`" class="tool-button px-3 py-2 text-xs">打开页面</RouterLink>
      <RouterLink v-if="editable" :to="`/edit/${item.slug}`" class="tool-button px-3 py-2 text-xs">继续编辑</RouterLink>
    </div>
  </article>
</template>
