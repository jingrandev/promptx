<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import { FileDiff, X } from 'lucide-vue-next'
import TaskDiffReviewPanel from './TaskDiffReviewPanel.vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  taskSlug: {
    type: String,
    default: '',
  },
  taskTitle: {
    type: String,
    default: '',
  },
  preferredScope: {
    type: String,
    default: 'task',
  },
  preferredRunId: {
    type: String,
    default: '',
  },
  focusToken: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['close'])

const titleText = computed(() => {
  const taskTitle = String(props.taskTitle || '').trim()
  return taskTitle ? `代码变更 · ${taskTitle}` : '代码变更'
})

function handleKeydown(event) {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('overflow-hidden', open)
    if (open) {
      window.addEventListener('keydown', handleKeydown)
      return
    }

    window.removeEventListener('keydown', handleKeydown)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('overflow-hidden')
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-6 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <section class="panel flex h-[min(90vh,960px)] w-full max-w-[min(96vw,1560px)] min-h-0 flex-col overflow-hidden">
        <div class="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 dark:border-[#39312c]">
          <div class="min-w-0">
            <div class="inline-flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
              <FileDiff class="h-4 w-4" />
              <span>{{ titleText }}</span>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-stone-400 transition hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-hidden p-4">
          <TaskDiffReviewPanel
            :task-slug="taskSlug"
            :active="open"
            :preferred-scope="preferredScope"
            :preferred-run-id="preferredRunId"
            :focus-token="focusToken"
          />
        </div>
      </section>
    </div>
  </Teleport>
</template>
