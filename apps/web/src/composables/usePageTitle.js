import { onBeforeUnmount, unref, watchEffect } from 'vue'

const DEFAULT_PAGE_TITLE = 'PromptX'

export function formatPageTitle(title = '') {
  const normalizedTitle = String(unref(title) || '').trim()
  return normalizedTitle ? `${DEFAULT_PAGE_TITLE} (${normalizedTitle})` : DEFAULT_PAGE_TITLE
}

export function usePageTitle(title = '') {
  const applyTitle = () => {
    if (typeof document === 'undefined') {
      return
    }
    document.title = formatPageTitle(title)
  }

  watchEffect(applyTitle)

  onBeforeUnmount(() => {
    if (typeof document === 'undefined') {
      return
    }
    document.title = DEFAULT_PAGE_TITLE
  })
}
