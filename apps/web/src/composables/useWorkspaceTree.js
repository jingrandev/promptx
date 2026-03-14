import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  listCodexSessionFiles,
  searchCodexSessionFiles,
} from '../lib/api.js'

const RECENT_PATHS_STORAGE_KEY = 'promptx:codex-recent-paths'
const MAX_RECENT_PATHS = 12

export function useWorkspaceTree(options) {
  const {
    props,
    panelRef,
    onClose,
    onSelect,
  } = options

  const rootNodes = ref([])
  const treeLoading = ref(false)
  const treeError = ref('')
  const searchResults = ref([])
  const searchLoading = ref(false)
  const searchError = ref('')
  const recentPaths = ref([])
  const persistedExpandedPaths = ref([])
  const activeTab = ref('tree')
  const activeKey = ref('')
  const panelStyle = ref({
    left: '12px',
    top: '12px',
    width: '560px',
    maxHeight: '420px',
  })
  const panelReady = ref(false)
  const panelPlacement = ref('bottom')

  const itemRefs = new Map()

  let searchTimer = null
  let searchRequestId = 0

  const normalizedQuery = computed(() => String(props.query || '').trim())
  const isSearchMode = computed(() => Boolean(normalizedQuery.value))
  const treeItems = computed(() => flattenTreeNodes(rootNodes.value))
  const storageSessionKey = computed(() => String(props.sessionId || '').trim())
  const treeExpandedStorageKey = computed(() => storageSessionKey.value ? `promptx:codex-tree-expanded:${storageSessionKey.value}` : '')
  const recentSearchItems = computed(() => {
    if (!normalizedQuery.value) {
      return recentPaths.value
    }

    const matchedPaths = new Set(searchResults.value.map((item) => item.path))
    return recentPaths.value.filter((item) => matchedPaths.has(item.path))
  })
  const normalSearchItems = computed(() => {
    const pinnedPaths = new Set(recentSearchItems.value.map((item) => item.path))
    return searchResults.value.filter((item) => !pinnedPaths.has(item.path))
  })
  const searchItems = computed(() => (
    normalizedQuery.value
      ? [...recentSearchItems.value, ...normalSearchItems.value]
      : recentPaths.value
  ))
  const visibleItems = computed(() => (activeTab.value === 'search' ? searchItems.value : treeItems.value))
  const currentLoading = computed(() => (activeTab.value === 'search' ? searchLoading.value : treeLoading.value))
  const currentError = computed(() => (activeTab.value === 'search' ? searchError.value : treeError.value))
  const showSearchPromptState = computed(() => (
    activeTab.value === 'search'
    && Boolean(props.sessionId)
    && !normalizedQuery.value
    && !recentPaths.value.length
  ))
  const showSearchEmptyState = computed(() => (
    activeTab.value === 'search'
    && Boolean(props.sessionId)
    && Boolean(normalizedQuery.value)
    && !searchLoading.value
    && !searchError.value
    && !searchItems.value.length
  ))
  const showTreeEmptyState = computed(() => (
    activeTab.value === 'tree'
    && Boolean(props.sessionId)
    && !treeLoading.value
    && !treeError.value
    && !treeItems.value.length
  ))

  function readStoredJson(key, fallback) {
    if (!key || typeof window === 'undefined') {
      return fallback
    }

    try {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  }

  function writeStoredJson(key, value) {
    if (!key || typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore storage failures
    }
  }

  function sortEntries(items = []) {
    return [...items].sort((left, right) => {
      const typeDiff = Number(left.type !== 'directory') - Number(right.type !== 'directory')
      if (typeDiff) {
        return typeDiff
      }
      return String(left.path || left.name || '').localeCompare(String(right.path || right.name || ''), 'zh-CN')
    })
  }

  function createTreeNode(entry) {
    return {
      ...entry,
      children: [],
      expanded: false,
      loaded: false,
      loading: false,
    }
  }

  function flattenTreeNodes(nodes = [], depth = 0, output = []) {
    nodes.forEach((node) => {
      output.push({
        ...node,
        depth,
      })

      if (node.type === 'directory' && node.expanded && node.children.length) {
        flattenTreeNodes(node.children, depth + 1, output)
      }
    })

    return output
  }

  function findTreeNode(targetPath, nodes = rootNodes.value) {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node
      }
      if (node.children.length) {
        const nested = findTreeNode(targetPath, node.children)
        if (nested) {
          return nested
        }
      }
    }
    return null
  }

  function refreshTreeView() {
    rootNodes.value = [...rootNodes.value]
  }

  function getExpandedPathsSnapshot(nodes = rootNodes.value, output = []) {
    nodes.forEach((node) => {
      if (node.type === 'directory' && node.expanded) {
        output.push(node.path)
        if (node.children.length) {
          getExpandedPathsSnapshot(node.children, output)
        }
      }
    })

    return output
  }

  function persistExpandedPaths() {
    if (!treeExpandedStorageKey.value) {
      return
    }

    const nextPaths = [...new Set(getExpandedPathsSnapshot())]
    persistedExpandedPaths.value = nextPaths
    writeStoredJson(treeExpandedStorageKey.value, nextPaths)
  }

  function loadPersistedExpandedPaths() {
    persistedExpandedPaths.value = treeExpandedStorageKey.value
      ? readStoredJson(treeExpandedStorageKey.value, []).filter(Boolean)
      : []
  }

  function loadRecentPaths() {
    const allItems = readStoredJson(RECENT_PATHS_STORAGE_KEY, [])
    if (!Array.isArray(allItems) || !storageSessionKey.value) {
      recentPaths.value = []
      return
    }

    recentPaths.value = allItems
      .filter((item) => item && item.sessionId === storageSessionKey.value && item.path)
      .sort((left, right) => Number(right.usedAt || 0) - Number(left.usedAt || 0))
      .slice(0, MAX_RECENT_PATHS)
  }

  function getDisplayName(item) {
    return item.name || item.path || '.'
  }

  function getDisplayPath(item) {
    return item.path || '.'
  }

  function saveRecentPath(item) {
    if (!storageSessionKey.value || !item?.path) {
      return
    }

    const record = {
      sessionId: storageSessionKey.value,
      path: item.path,
      name: item.name || getDisplayName(item),
      type: item.type || 'file',
      usedAt: Date.now(),
    }
    const existing = readStoredJson(RECENT_PATHS_STORAGE_KEY, [])
    const nextRecords = [record]

    if (Array.isArray(existing)) {
      existing.forEach((entry) => {
        if (!entry?.path || !entry?.sessionId) {
          return
        }
        if (entry.sessionId === record.sessionId && entry.path === record.path) {
          return
        }
        nextRecords.push(entry)
      })
    }

    writeStoredJson(RECENT_PATHS_STORAGE_KEY, nextRecords.slice(0, 40))
    loadRecentPaths()
  }

  function getParentPath(pathValue = '') {
    const value = String(pathValue || '').trim()
    if (!value || !value.includes('/')) {
      return ''
    }
    return value.slice(0, value.lastIndexOf('/'))
  }

  function getCurrentActiveIndex() {
    const items = visibleItems.value
    if (!items.length) {
      return -1
    }

    const index = items.findIndex((item) => item.path === activeKey.value)
    return index >= 0 ? index : 0
  }

  function getActiveItem() {
    const items = visibleItems.value
    const index = getCurrentActiveIndex()
    if (index < 0 || !items.length) {
      return null
    }
    return items[index] || null
  }

  function syncActiveKey() {
    const items = visibleItems.value
    if (!items.length) {
      activeKey.value = ''
      return
    }

    if (items.some((item) => item.path === activeKey.value)) {
      return
    }

    activeKey.value = items[0].path
  }

  function setItemRef(pathValue, element) {
    if (element) {
      itemRefs.set(pathValue, element)
      return
    }
    itemRefs.delete(pathValue)
  }

  function scrollActiveItemIntoView() {
    const target = itemRefs.get(activeKey.value)
    target?.scrollIntoView?.({ block: 'nearest' })
  }

  function escapeHtml(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function findHighlightRange(text = '', query = '') {
    const source = String(text || '')
    const keyword = String(query || '').trim().toLowerCase()
    if (!source || !keyword) {
      return null
    }

    const normalizedSource = source.toLowerCase()
    const directIndex = normalizedSource.indexOf(keyword)
    if (directIndex >= 0) {
      return {
        start: directIndex,
        end: directIndex + keyword.length,
      }
    }

    const tokens = keyword
      .split(/[\\/\s_.-]+/)
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)

    for (const token of tokens) {
      if (token.length < 2) {
        continue
      }

      const tokenIndex = normalizedSource.indexOf(token)
      if (tokenIndex >= 0) {
        return {
          start: tokenIndex,
          end: tokenIndex + token.length,
        }
      }
    }

    return null
  }

  function renderHighlightedText(text = '', query = '') {
    const source = String(text || '')
    const range = findHighlightRange(source, query)
    if (!range) {
      return escapeHtml(source)
    }

    return `${escapeHtml(source.slice(0, range.start))}<mark class="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/25">${escapeHtml(source.slice(range.start, range.end))}</mark>${escapeHtml(source.slice(range.end))}`
  }

  function getHighlightedName(item) {
    return renderHighlightedText(getDisplayName(item), normalizedQuery.value)
  }

  function getHighlightedPath(item) {
    return renderHighlightedText(getDisplayPath(item), normalizedQuery.value)
  }

  async function loadTree(parentPath = '', options = {}) {
    if (!props.sessionId) {
      rootNodes.value = []
      treeError.value = ''
      treeLoading.value = false
      return
    }

    const isRoot = !parentPath
    const node = isRoot ? null : findTreeNode(parentPath)
    if (!isRoot && !node) {
      return
    }

    if (!options.force) {
      if (isRoot && rootNodes.value.length) {
        return
      }
      if (!isRoot && node.loaded) {
        return
      }
    }

    if (isRoot) {
      treeLoading.value = true
      treeError.value = ''
    } else {
      node.loading = true
      treeError.value = ''
      refreshTreeView()
    }

    try {
      const payload = await listCodexSessionFiles(props.sessionId, {
        path: parentPath,
      })
      const nextChildren = sortEntries(payload.items || []).map(createTreeNode)

      if (isRoot) {
        rootNodes.value = nextChildren
        return
      }

      node.children = nextChildren
      node.loaded = true
    } catch (error) {
      treeError.value = error.message
    } finally {
      if (isRoot) {
        treeLoading.value = false
      } else {
        node.loading = false
        refreshTreeView()
      }
    }
  }

  async function restoreExpandedTree(nodes = rootNodes.value, expandedPathSet = new Set()) {
    for (const node of nodes) {
      if (node.type !== 'directory' || !expandedPathSet.has(node.path)) {
        continue
      }

      node.expanded = true
      refreshTreeView()
      await loadTree(node.path)

      if (node.children.length) {
        await restoreExpandedTree(node.children, expandedPathSet)
      }
    }
  }

  async function loadInitialTree(options = {}) {
    await loadTree('', options)
    const expandedPathSet = new Set(persistedExpandedPaths.value)
    const hasPersistedPaths = expandedPathSet.size > 0

    for (const node of rootNodes.value) {
      if (node.type !== 'directory' || !node.hasChildren) {
        continue
      }

      node.expanded = hasPersistedPaths ? expandedPathSet.has(node.path) : true
    }
    refreshTreeView()

    if (hasPersistedPaths) {
      await restoreExpandedTree(rootNodes.value, expandedPathSet)
      return
    }

    const expandableRoots = rootNodes.value.filter((node) => node.type === 'directory' && node.expanded && node.hasChildren)
    await Promise.all(expandableRoots.map((node) => loadTree(node.path)))
    persistExpandedPaths()
  }

  async function toggleDirectory(pathValue) {
    if (activeTab.value !== 'tree') {
      return
    }

    const node = findTreeNode(pathValue)
    if (!node || node.type !== 'directory') {
      return
    }

    if (!node.loaded && !node.loading) {
      node.expanded = true
      refreshTreeView()
      await loadTree(node.path)
      persistExpandedPaths()
      return
    }

    node.expanded = !node.expanded
    refreshTreeView()
    persistExpandedPaths()
  }

  function emitSelect(item) {
    if (!item?.path) {
      return false
    }

    saveRecentPath(item)
    onSelect?.(item)
    return true
  }

  async function refreshSearch() {
    const query = normalizedQuery.value
    searchRequestId += 1
    const requestId = searchRequestId

    if (!props.open || !props.sessionId || !query) {
      searchLoading.value = false
      searchError.value = ''
      if (!query) {
        searchResults.value = []
      }
      return
    }

    try {
      const payload = await searchCodexSessionFiles(props.sessionId, query, {
        limit: 80,
      })
      if (requestId !== searchRequestId) {
        return
      }

      searchResults.value = payload.items || []
    } catch (error) {
      if (requestId !== searchRequestId) {
        return
      }
      searchError.value = error.message
      searchResults.value = []
    } finally {
      if (requestId === searchRequestId) {
        searchLoading.value = false
      }
    }
  }

  function scheduleSearch() {
    if (searchTimer) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }

    if (!props.open || !props.sessionId || !normalizedQuery.value) {
      searchLoading.value = false
      searchError.value = ''
      if (!normalizedQuery.value) {
        searchResults.value = []
      }
      return
    }

    searchLoading.value = true
    searchError.value = ''

    searchTimer = window.setTimeout(() => {
      refreshSearch()
    }, 120)
  }

  function setActiveTab(nextTab) {
    activeTab.value = nextTab
    if (nextTab === 'tree' && props.sessionId && !treeLoading.value && !rootNodes.value.length) {
      loadInitialTree({ force: true })
    }
    nextTick(() => {
      syncActiveKey()
      scrollActiveItemIntoView()
    })
  }

  function moveActive(step) {
    const items = visibleItems.value
    if (!items.length) {
      return false
    }

    const currentIndex = getCurrentActiveIndex()
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + step + items.length) % items.length

    activeKey.value = items[nextIndex].path
    return true
  }

  async function expandActiveDirectory() {
    if (activeTab.value !== 'tree') {
      return false
    }

    const item = getActiveItem()
    if (!item || item.type !== 'directory') {
      return false
    }

    if (!item.expanded) {
      await toggleDirectory(item.path)
      activeKey.value = item.path
      return true
    }

    const items = visibleItems.value
    const currentIndex = getCurrentActiveIndex()
    const nextItem = items[currentIndex + 1]
    if (nextItem && getParentPath(nextItem.path) === item.path) {
      activeKey.value = nextItem.path
      return true
    }

    return false
  }

  function collapseActiveDirectory() {
    if (activeTab.value !== 'tree') {
      return false
    }

    const item = getActiveItem()
    if (!item) {
      return false
    }

    if (item.type === 'directory' && item.expanded) {
      const node = findTreeNode(item.path)
      if (node) {
        node.expanded = false
        refreshTreeView()
        persistExpandedPaths()
      }
      activeKey.value = item.path
      return true
    }

    const parentPath = getParentPath(item.path)
    if (!parentPath) {
      return false
    }

    activeKey.value = parentPath
    return true
  }

  function confirmActive() {
    const items = visibleItems.value
    if (!items.length) {
      return false
    }

    return emitSelect(items[getCurrentActiveIndex()])
  }

  function switchTab(step = 1) {
    const tabs = ['search', 'tree']
    const currentIndex = tabs.indexOf(activeTab.value)
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + step + tabs.length) % tabs.length

    setActiveTab(tabs[nextIndex])
    return true
  }

  function closePicker() {
    onClose?.()
  }

  function buildPanelStyle(force = false) {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = 12
    const gap = 8
    const minWidth = 320
    const preferredWidth = 560
    const preferredHeight = 420
    const minHeight = 180
    const width = Math.min(preferredWidth, Math.max(minWidth, viewportWidth - margin * 2))
    const safeWidth = Math.min(width, viewportWidth - margin * 2)
    const anchor = props.anchorRect || {
      left: (viewportWidth - safeWidth) / 2,
      top: viewportHeight / 2,
      bottom: viewportHeight / 2,
    }

    let left = anchor.left
    if (left + safeWidth > viewportWidth - margin) {
      left = viewportWidth - margin - safeWidth
    }
    if (left < margin) {
      left = margin
    }

    const availableBelow = Math.max(0, viewportHeight - margin - (anchor.bottom + gap))
    const availableAbove = Math.max(0, anchor.top - gap - margin)

    if (force) {
      panelPlacement.value = availableBelow >= availableAbove ? 'bottom' : 'top'
    } else if (panelPlacement.value === 'bottom' && availableBelow < minHeight && availableAbove > availableBelow + 24) {
      panelPlacement.value = 'top'
    } else if (panelPlacement.value === 'top' && availableAbove < minHeight && availableBelow > availableAbove + 24) {
      panelPlacement.value = 'bottom'
    }

    const placement = panelPlacement.value
    const selectedSpace = placement === 'bottom' ? availableBelow : availableAbove
    const viewportLimit = Math.max(140, viewportHeight - margin * 2)
    const maxHeight = Math.min(viewportLimit, Math.max(Math.min(preferredHeight, selectedSpace || preferredHeight), minHeight))
    const nextStyle = {
      left: `${Math.round(left)}px`,
      width: `${Math.round(safeWidth)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      top: 'auto',
      bottom: 'auto',
    }

    if (placement === 'bottom') {
      nextStyle.top = `${Math.round(Math.max(margin, anchor.bottom + gap))}px`
    } else {
      nextStyle.bottom = `${Math.round(Math.max(margin, viewportHeight - anchor.top + gap))}px`
    }

    return nextStyle
  }

  function updatePanelPosition(force = false) {
    const nextStyle = buildPanelStyle(force)
    panelStyle.value = {
      ...panelStyle.value,
      left: nextStyle.left,
      top: nextStyle.top,
      bottom: nextStyle.bottom,
      width: nextStyle.width,
      maxHeight: nextStyle.maxHeight,
    }
  }

  function handlePointerDown(event) {
    if (!props.open || !panelRef.value) {
      return
    }

    if (!panelRef.value.contains(event.target)) {
      closePicker()
    }
  }

  watch(
    () => props.open,
    (open) => {
      if (!open) {
        if (searchTimer) {
          window.clearTimeout(searchTimer)
          searchTimer = null
        }
        searchResults.value = []
        searchError.value = ''
        searchLoading.value = false
        panelReady.value = false
        return
      }

      panelReady.value = false
      if (!props.anchorRect) {
        return
      }

      panelPlacement.value = 'bottom'
      updatePanelPosition(true)
      panelReady.value = true
      loadRecentPaths()
      loadPersistedExpandedPaths()
      setActiveTab(isSearchMode.value ? 'search' : 'tree')
      if (props.sessionId) {
        loadInitialTree({ force: true })
      }
      scheduleSearch()
    },
    { flush: 'sync' }
  )

  watch(
    () => props.anchorRect,
    (anchorRect) => {
      if (!props.open || !anchorRect) {
        return
      }

      if (!panelReady.value) {
        panelPlacement.value = 'bottom'
        updatePanelPosition(true)
        panelReady.value = true
        return
      }

      updatePanelPosition(false)
    },
    { flush: 'sync' }
  )

  watch(
    () => props.sessionId,
    () => {
      rootNodes.value = []
      treeError.value = ''
      searchResults.value = []
      searchError.value = ''
      loadRecentPaths()
      loadPersistedExpandedPaths()
      if (!props.sessionId) {
        return
      }

      loadInitialTree({ force: true })
      if (props.open) {
        scheduleSearch()
      }
    },
    { flush: 'sync', immediate: true }
  )

  watch(
    () => props.query,
    () => {
      setActiveTab(isSearchMode.value ? 'search' : 'tree')
      scheduleSearch()
    },
    { immediate: true }
  )

  watch(visibleItems, () => {
    syncActiveKey()
    nextTick(scrollActiveItemIntoView)
  }, { immediate: true })

  watch(
    () => activeKey.value,
    () => {
      nextTick(scrollActiveItemIntoView)
    }
  )

  onMounted(() => {
    document.addEventListener('pointerdown', handlePointerDown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handlePointerDown)
    if (searchTimer) {
      window.clearTimeout(searchTimer)
    }
  })

  return {
    activeKey,
    activeTab,
    closePicker,
    collapseActiveDirectory,
    confirmActive,
    currentError,
    currentLoading,
    emitSelect,
    expandActiveDirectory,
    getDisplayName,
    getHighlightedName,
    getHighlightedPath,
    moveActive,
    normalSearchItems,
    normalizedQuery,
    panelReady,
    panelStyle,
    recentSearchItems,
    setActiveTab,
    setItemRef,
    showSearchEmptyState,
    showSearchPromptState,
    showTreeEmptyState,
    switchTab,
    toggleDirectory,
    treeItems,
    visibleItems,
  }
}
