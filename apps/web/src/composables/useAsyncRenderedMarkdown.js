import { computed, onBeforeUnmount, ref, watch } from 'vue'

export function useAsyncRenderedMarkdown(options = {}) {
  const {
    items,
    themeKey,
    getCacheKey = (item) => String(item?.id || '').trim(),
    getSource = (item) => String(item?.content || ''),
    shouldRender = () => true,
    renderAsync = async (source) => source,
    renderFallback = (source) => source,
    onRendered = null,
  } = options

  const renderedCache = new Map()
  const pendingTokens = new Map()
  const renderVersion = ref(0)
  const renderEntries = computed(() => (
    (Array.isArray(items?.value) ? items.value : []).map((item) => {
      const active = Boolean(shouldRender(item))
      const cacheKey = String(getCacheKey(item) || '').trim()
      const source = active ? String(getSource(item) || '') : ''

      return {
        item,
        active,
        cacheKey,
        source,
      }
    })
  ))

  function getRenderedHtml(item) {
    renderVersion.value

    if (!shouldRender(item)) {
      return ''
    }

    const source = String(getSource(item) || '')
    const cacheKey = String(getCacheKey(item) || '').trim()
    const currentThemeKey = String(themeKey?.value || '')

    if (!cacheKey) {
      return renderFallback(source, item)
    }

    const cached = renderedCache.get(cacheKey)
    if (cached?.source === source && cached?.theme === currentThemeKey) {
      return cached.html
    }

    return renderFallback(source, item)
  }

  async function renderItem(item) {
    if (!shouldRender(item)) {
      return
    }

    const source = String(getSource(item) || '')
    const cacheKey = String(getCacheKey(item) || '').trim()
    if (!cacheKey) {
      return
    }

    const currentThemeKey = String(themeKey?.value || '')
    const cached = renderedCache.get(cacheKey)
    if (cached?.source === source && cached?.theme === currentThemeKey) {
      return
    }

    const token = Symbol(cacheKey)
    pendingTokens.set(cacheKey, token)

    try {
      const html = await renderAsync(source, item, {
        themeKey: currentThemeKey,
      })

      if (pendingTokens.get(cacheKey) !== token) {
        return
      }

      renderedCache.set(cacheKey, {
        source,
        theme: currentThemeKey,
        html,
      })
      renderVersion.value += 1
      onRendered?.(item, {
        cacheKey,
        source,
        themeKey: currentThemeKey,
      })
    } catch {
      // 回退到同步 markdown 即可
    } finally {
      if (pendingTokens.get(cacheKey) === token) {
        pendingTokens.delete(cacheKey)
      }
    }
  }

  function scheduleRenderEntries(entryList = []) {
    entryList.forEach((entry) => {
      if (entry?.item) {
        renderItem(entry.item)
      }
    })
  }

  function pruneEntries(entryList = []) {
    const validCacheKeys = new Set(
      (Array.isArray(entryList) ? entryList : [])
        .filter((entry) => entry?.active)
        .map((entry) => String(entry?.cacheKey || '').trim())
        .filter(Boolean)
    )

    let changed = false

    for (const key of renderedCache.keys()) {
      if (!validCacheKeys.has(key)) {
        renderedCache.delete(key)
        changed = true
      }
    }

    for (const key of pendingTokens.keys()) {
      if (!validCacheKeys.has(key)) {
        pendingTokens.delete(key)
      }
    }

    if (changed) {
      renderVersion.value += 1
    }
  }

  watch(
    renderEntries,
    () => {
      pruneEntries(renderEntries.value || [])
      scheduleRenderEntries(renderEntries.value || [])
    },
    { immediate: true }
  )

  watch(
    themeKey,
    () => {
      scheduleRenderEntries(renderEntries.value || [])
    }
  )

  onBeforeUnmount(() => {
    pendingTokens.clear()
  })

  return {
    getRenderedHtml,
  }
}
