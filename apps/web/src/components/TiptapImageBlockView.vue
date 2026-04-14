<script setup>
import { Image as ImageIcon, Trash2 } from 'lucide-vue-next'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useI18n } from '../composables/useI18n.js'
import TiptapSpecialBlockFrame from './TiptapSpecialBlockFrame.vue'
import { restoreTiptapNodeViewEditorFocus } from './tiptapNodeViewFocus.js'

const props = defineProps(nodeViewProps)
const { t } = useI18n()
const compactDangerButtonClass = 'tool-button tool-button-danger-subtle inline-flex min-w-0 items-center justify-center gap-1 whitespace-nowrap px-2 py-1 text-[12px]'

function openPreview() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent('promptx:tiptap-image-preview', {
    detail: {
      src: String(props.node?.attrs?.src || ''),
    },
  }))
}

function removeNode() {
  props.deleteNode?.()
  restoreTiptapNodeViewEditorFocus(props.editor)
}
</script>

<template>
  <NodeViewWrapper class="group" data-promptx-node="image">
    <TiptapSpecialBlockFrame
      :selected="selected"
      frame-class="theme-inline-panel border"
      header-class="theme-muted-text"
      header-padding-class="px-3 py-2"
    >
      <template #header="{ actionsStateClass }">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="theme-heading min-w-0 inline-flex items-center gap-1.5 text-xs font-medium leading-5">
            <ImageIcon class="h-3.5 w-3.5 shrink-0" />
            {{ t('blockEditor.image') }}
          </div>

          <div class="shrink-0 transition" :class="actionsStateClass">
            <button
              type="button"
              :class="compactDangerButtonClass"
              contenteditable="false"
              @click="removeNode"
            >
              <Trash2 class="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span>{{ t('blockEditor.delete') }}</span>
            </button>
          </div>
        </div>
      </template>

      <div class="mx-auto flex w-full max-w-[720px] justify-center px-4 py-4">
        <button
          type="button"
          class="inline-flex cursor-zoom-in justify-center"
          contenteditable="false"
          @click="openPreview"
        >
          <img
            :src="node.attrs?.src"
            :alt="t('blockEditor.insertedImageAlt')"
            class="max-h-[380px] w-auto max-w-full object-contain"
          />
        </button>
      </div>
    </TiptapSpecialBlockFrame>
  </NodeViewWrapper>
</template>
