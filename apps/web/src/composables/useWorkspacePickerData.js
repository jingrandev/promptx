import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  listCodexSessionFiles,
  searchCodexSessionFiles,
} from '../lib/api.js'
import {
  isAbortError,
  WORKSPACE_PATH_SEARCH_DEBOUNCE_MS,
  WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
} from '../lib/workspaceSearch.js'

const RECENT_PATHS_STORAGE_KEY = 'promptx:codex-recent-paths'
const MAX_RECENT_PATHS = 12

export function useWorkspacePickerData(options) {
  const {
    getMode,
    props,
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
  const modeState = ref('tree')
  const activeKey = ref('')

  const itemRefs = new Map()

  let searchTimer = null
  let searchRequestId = 0
  let pickerRefreshToken = 0
  let searchAbortController = null

  const normalizedQuery = computed(() => String(props.query || '').trim())
  const minimumQueryLength = computed(() => Math.max(1, Number(options.minimumQueryLength) || WORKSPACE_SEARCH_MIN_QUERY_LENGTH))
  const isQueryReady = computed(() => normalizedQuery.value.length >= minimumQueryLength.value)
  const hasControlledMode = computed(() => typeof getMode === 'function')
  const resolvedMode = computed(() => {
    if (!hasControlledMode.value) {
      return modeState.value
    }

    const nextMode = String(getMode?.() || '').trim()
    return nextMode === 'search' ? 'search' : 'tree'
  })
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
  const visibleItems = computed(() => (resolvedMode.value === 'search' ? searchItems.value : treeItems.value))
  const currentLoading = computed(() => (resolvedMode.value === 'search' ? searchLoading.value : treeLoading.value))
  const currentError = computed(() => (resolvedMode.value === 'search' ? searchError.value : treeError.value))
  const showSearchEmptyState = computed(() => (
    resolvedMode.value === 'search'
    && Boolean(props.sessionId)
    && isQueryReady.value
    && !searchLoading.value
    && !searchError.value
    && !searchItems.value.length
  ))
  const showSearchPromptState = computed(() => (
    resolvedMode.value === 'search'
    && Boolean(props.sessionId)
    && Boolean(normalizedQuery.value)
    && !isQueryReady.value
    && !searchLoading.value
    && !searchError.value
  ))
  const showTreeEmptyState = computed(() => (
    resolvedMode.value === 'tree'
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

  function clearSearchRequest() {
    if (searchTimer) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }
    if (searchAbortController) {
      searchAbortController.abort()
      searchAbortController = null
    }
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

  function isLegacyAutoExpandedSnapshot(nodes = rootNodes.value, expandedPathSet = new Set()) {
    if (!expandedPathSet.size) {
      return false
    }

    const expandableRootPaths = nodes
      .filter((node) => node.type === 'directory' && node.hasChildren)
      .map((node) => node.path)

    if (!expandableRootPaths.length || expandableRootPaths.length !== expandedPathSet.size) {
      return false
    }

    return expandableRootPaths.every((nodePath) => expandedPathSet.has(nodePath))
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

    return `${escapeHtml(source.slice(0, range.start))}<mark class="theme-search-highlight">${escapeHtml(source.slice(range.start, range.end))}</mark>${escapeHtml(source.slice(range.end))}`
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
        refreshToken: options.refreshToken || '',
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

  async function restoreExpandedTree(nodes = rootNodes.value, expandedPathSet = new Set(), options = {}) {
    for (const node of nodes) {
      if (node.type !== 'directory' || !expandedPathSet.has(node.path)) {
        continue
      }

      node.expanded = true
      refreshTreeView()
      await loadTree(node.path, options)

      if (node.children.length) {
        await restoreExpandedTree(node.children, expandedPathSet, options)
      }
    }
  }

  async function loadInitialTree(options = {}) {
    await loadTree('', options)
    const expandedPathSet = new Set(persistedExpandedPaths.value)
    const hasLegacyAutoExpandedSnapshot = isLegacyAutoExpandedSnapshot(rootNodes.value, expandedPathSet)
    const hasPersistedPaths = expandedPathSet.size > 0 && !hasLegacyAutoExpandedSnapshot

    if (hasLegacyAutoExpandedSnapshot) {
      persistedExpandedPaths.value = []
      writeStoredJson(treeExpandedStorageKey.value, [])
      expandedPathSet.clear()
    }

    for (const node of rootNodes.value) {
      if (node.type !== 'directory' || !node.hasChildren) {
        continue
      }

      node.expanded = hasPersistedPaths ? expandedPathSet.has(node.path) : false
    }
    refreshTreeView()

    if (hasPersistedPaths) {
      await restoreExpandedTree(rootNodes.value, expandedPathSet, options)
      return
    }
  }

  async function toggleDirectory(pathValue) {
    if (resolvedMode.value !== 'tree') {
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

  async function refreshSearch(options = {}) {
    const query = normalizedQuery.value
    searchRequestId += 1
    const requestId = searchRequestId
    const refreshToken = options.refreshToken || ''
    clearSearchRequest()

    if (!props.open || !props.sessionId || !query || !isQueryReady.value) {
      searchLoading.value = false
      searchError.value = ''
      searchResults.value = []
      return
    }

    searchAbortController = new AbortController()

    try {
      const payload = await searchCodexSessionFiles(props.sessionId, query, {
        limit: 80,
        refreshToken,
        signal: searchAbortController.signal,
      })
      if (requestId !== searchRequestId) {
        return
      }

      searchResults.value = payload.items || []
    } catch (error) {
      if (isAbortError(error)) {
        return
      }
      if (requestId !== searchRequestId) {
        return
      }
      searchError.value = error.message
      searchResults.value = []
    } finally {
      if (requestId === searchRequestId) {
        searchAbortController = null
      }
      if (requestId === searchRequestId) {
        searchLoading.value = false
      }
    }
  }

  function scheduleSearch(options = {}) {
    clearSearchRequest()

    if (!props.open || !props.sessionId || !normalizedQuery.value || !isQueryReady.value) {
      searchLoading.value = false
      searchError.value = ''
      searchResults.value = []
      return
    }

    searchLoading.value = true
    searchError.value = ''

    searchTimer = window.setTimeout(() => {
      searchTimer = null
      refreshSearch(options)
    }, WORKSPACE_PATH_SEARCH_DEBOUNCE_MS)
  }

  function refreshPickerData() {
    if (!props.sessionId) {
      rootNodes.value = []
      treeError.value = ''
      treeLoading.value = false
      searchResults.value = []
      searchError.value = ''
      searchLoading.value = false
      return
    }

    pickerRefreshToken = Date.now()
    rootNodes.value = []
    treeError.value = ''
    searchResults.value = []
    searchError.value = ''
    loadInitialTree({
      force: true,
      refreshToken: pickerRefreshToken,
    })
    scheduleSearch({
      refreshToken: pickerRefreshToken,
    })
  }

  function syncModeFromQuery() {
    if (hasControlledMode.value) {
      return false
    }

    const nextMode = normalizedQuery.value ? 'search' : 'tree'
    if (modeState.value === nextMode) {
      return false
    }

    modeState.value = nextMode
    return true
  }

  function initializeData() {
    loadRecentPaths()
    loadPersistedExpandedPaths()
    syncModeFromQuery()
    refreshPickerData()
  }

  function resetData() {
    clearSearchRequest()
    searchResults.value = []
    searchError.value = ''
    searchLoading.value = false
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
    nextTick(scrollActiveItemIntoView)
    return true
  }

  async function expandActiveDirectory() {
    if (resolvedMode.value !== 'tree') {
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
    if (resolvedMode.value !== 'tree') {
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

  function handleSessionChange() {
    rootNodes.value = []
    treeError.value = ''
    treeLoading.value = false
    searchResults.value = []
    searchError.value = ''
    searchLoading.value = false
    loadRecentPaths()
    loadPersistedExpandedPaths()
    if (!props.sessionId) {
      return
    }

    if (!props.open) {
      return
    }

    loadInitialTree({ force: true })
    scheduleSearch()
  }

  function handleQueryChange() {
    syncModeFromQuery()
    scheduleSearch()
  }

  function handleVisibleItemsChange() {
    syncActiveKey()
    nextTick(scrollActiveItemIntoView)
  }

  onBeforeUnmount(() => {
    clearSearchRequest()
  })

  return {
    activeKey,
    collapseActiveDirectory,
    confirmActive,
    currentError,
    currentLoading,
    emitSelect,
    expandActiveDirectory,
    getDisplayName,
    getHighlightedName,
    getHighlightedPath,
    handleQueryChange,
    handleSessionChange,
    handleVisibleItemsChange,
    initializeData,
    moveActive,
    normalSearchItems,
    normalizedQuery,
    recentSearchItems,
    resetData,
    setItemRef,
    showSearchPromptState,
    showSearchEmptyState,
    showTreeEmptyState,
    toggleDirectory,
    treeItems,
    visibleItems,
  }
}
