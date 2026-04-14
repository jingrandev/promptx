import { onBeforeUnmount, onMounted, ref } from 'vue'

const DEFAULT_BUTTON_WIDTH = 96
const DEFAULT_BUTTON_HEIGHT = 34
const DEFAULT_GAP = 8
const DEFAULT_DEBOUNCE_MS = 72

function getElementFromNode(node) {
  if (!node) {
    return null
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return node
  }

  return node.parentElement || null
}

function getClosestRowElement(node, rowSelector, container) {
  const element = getElementFromNode(node)
  if (!element || !container) {
    return null
  }

  const row = element.closest?.(rowSelector)
  return row && container.contains(row) ? row : null
}

function getSelectionCommonAncestor(range) {
  const ancestor = range?.commonAncestorContainer || null
  if (!ancestor) {
    return null
  }

  return ancestor.nodeType === Node.ELEMENT_NODE
    ? ancestor
    : ancestor.parentNode || null
}

function getFloatingActionPosition(
  rect,
  containerRect,
  {
    codeLeft = 0,
    buttonWidth = DEFAULT_BUTTON_WIDTH,
    scrollTop = 0,
    scrollLeft = 0,
    clientWidth = 0,
    clientHeight = 0,
  } = {}
) {
  const preferredLeft = Math.max(rect.left || 0, Number(codeLeft) || 0)
  const rawLeft = preferredLeft - containerRect.left + scrollLeft
  const minLeft = scrollLeft + DEFAULT_GAP
  const maxLeft = scrollLeft + Math.max(DEFAULT_GAP, clientWidth - buttonWidth - DEFAULT_GAP)
  const left = Math.max(minLeft, Math.min(maxLeft, rawLeft || scrollLeft + DEFAULT_GAP))

  const preferredTop = rect.bottom - containerRect.top + scrollTop + DEFAULT_GAP
  const fallbackTop = rect.top - containerRect.top + scrollTop - DEFAULT_BUTTON_HEIGHT - DEFAULT_GAP
  const minTop = scrollTop + DEFAULT_GAP
  const maxBottom = scrollTop + clientHeight - DEFAULT_GAP
  const top = preferredTop + DEFAULT_BUTTON_HEIGHT <= maxBottom
    ? preferredTop
    : Math.max(minTop, fallbackTop)

  return { top, left }
}

export function useCodeSelectionAction(options = {}) {
  const selectedRows = ref([])
  const selectionAction = ref({
    visible: false,
    top: 0,
    left: 0,
    content: '',
  })

  let selectionTimer = null
  let positionFrameId = 0

  function getContainer() {
    if (typeof options.getContainer === 'function') {
      return options.getContainer()
    }
    return options.containerRef?.value || null
  }

  function getPositionContainer() {
    if (typeof options.getPositionContainer === 'function') {
      return options.getPositionContainer()
    }
    return getContainer()
  }

  function clearScheduledSelectionUpdate() {
    if (selectionTimer) {
      window.clearTimeout(selectionTimer)
      selectionTimer = null
    }
  }

  function clearScheduledPositionRefresh() {
    if (positionFrameId) {
      window.cancelAnimationFrame(positionFrameId)
      positionFrameId = 0
    }
  }

  function syncSelectedRows(nextRows = []) {
    selectedRows.value = nextRows
    options.onSelectedRowsChange?.(nextRows)
  }

  function clearSelectionState({ clearBrowserSelection = false } = {}) {
    clearScheduledSelectionUpdate()
    clearScheduledPositionRefresh()

    if (clearBrowserSelection) {
      window.getSelection?.()?.removeAllRanges?.()
    }

    selectionAction.value = {
      visible: false,
      top: 0,
      left: 0,
      content: '',
    }
    syncSelectedRows([])
    options.onClear?.()
  }

  function getOrderedRowElements(container) {
    if (!container) {
      return []
    }

    if (typeof options.getOrderedRowElements === 'function') {
      return options.getOrderedRowElements(container).filter(Boolean)
    }

    return [...container.querySelectorAll(String(options.rowSelector || ''))]
  }

  function mapRowElement(rowElement) {
    return options.mapRowElement?.(rowElement) ?? rowElement
  }

  function collectSelectedRowElements(selection, range, container) {
    const rowSelector = String(options.rowSelector || '').trim()
    const rows = getOrderedRowElements(container)
    if (!rowSelector || !rows.length) {
      return []
    }

    const startRow = getClosestRowElement(selection.anchorNode, rowSelector, container)
    const endRow = getClosestRowElement(selection.focusNode, rowSelector, container)

    if (startRow && endRow) {
      const startIndex = rows.indexOf(startRow)
      const endIndex = rows.indexOf(endRow)
      if (startIndex >= 0 && endIndex >= 0) {
        const [fromIndex, toIndex] = startIndex <= endIndex
          ? [startIndex, endIndex]
          : [endIndex, startIndex]
        return rows.slice(fromIndex, toIndex + 1)
      }
    }

    return rows.filter((row) => {
      try {
        return range.intersectsNode(row)
      } catch {
        return false
      }
    })
  }

  function updateSelectionActionFromDom() {
    const selection = window.getSelection?.()
    const container = getContainer()
    const positionContainer = getPositionContainer()
    const isActive = typeof options.isActive === 'function' ? options.isActive() : true

    if (!isActive || !selection || selection.rangeCount < 1 || selection.isCollapsed || !container || !positionContainer) {
      clearSelectionState()
      return
    }

    const range = selection.getRangeAt(0)
    const ancestor = getSelectionCommonAncestor(range)
    if (!ancestor || !container.contains(ancestor)) {
      clearSelectionState()
      return
    }

    const content = String(selection.toString() || '').replace(/\u200b/g, '')
    if (!content.trim()) {
      clearSelectionState()
      return
    }

    const rowElements = collectSelectedRowElements(selection, range, container)
    if (!rowElements.length) {
      clearSelectionState()
      return
    }

    const rowValues = rowElements
      .map((rowElement) => mapRowElement(rowElement))
      .filter((value) => value !== null && typeof value !== 'undefined')

    if (!rowValues.length) {
      clearSelectionState()
      return
    }

    const rect = range.getBoundingClientRect()
    const containerRect = positionContainer.getBoundingClientRect?.()
    if (!containerRect) {
      clearSelectionState()
      return
    }
    const codeLeft = options.getCodeLeft?.(rowElements[0]) || rect.left
    const position = getFloatingActionPosition(
      rect,
      containerRect,
      {
        codeLeft,
        buttonWidth: Number(options.buttonWidth || DEFAULT_BUTTON_WIDTH),
        scrollTop: Number(positionContainer.scrollTop || 0),
        scrollLeft: Number(positionContainer.scrollLeft || 0),
        clientWidth: Number(positionContainer.clientWidth || 0),
        clientHeight: Number(positionContainer.clientHeight || 0),
      }
    )

    selectionAction.value = {
      visible: true,
      top: position.top,
      left: position.left,
      content,
    }
    syncSelectedRows(rowValues)
  }

  function scheduleSelectionUpdate() {
    clearScheduledSelectionUpdate()
    selectionTimer = window.setTimeout(() => {
      selectionTimer = null
      updateSelectionActionFromDom()
    }, Number(options.debounceMs || DEFAULT_DEBOUNCE_MS))
  }

  function handleSelectionMouseUp() {
    scheduleSelectionUpdate()
  }

  function handleDocumentSelectionChange() {
    scheduleSelectionUpdate()
  }

  function scheduleSelectionPositionRefresh() {
    if (!selectionAction.value.visible || positionFrameId) {
      return
    }

    positionFrameId = window.requestAnimationFrame(() => {
      positionFrameId = 0
      updateSelectionActionFromDom()
    })
  }

  function handleViewportChange() {
    scheduleSelectionPositionRefresh()
  }

  onMounted(() => {
    document.addEventListener('selectionchange', handleDocumentSelectionChange)
    document.addEventListener('mouseup', handleDocumentSelectionChange)
    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener?.('resize', handleViewportChange)
    window.visualViewport?.addEventListener?.('scroll', handleViewportChange)
  })

  onBeforeUnmount(() => {
    clearSelectionState({ clearBrowserSelection: true })
    document.removeEventListener('selectionchange', handleDocumentSelectionChange)
    document.removeEventListener('mouseup', handleDocumentSelectionChange)
    document.removeEventListener('scroll', handleViewportChange, true)
    window.removeEventListener('resize', handleViewportChange)
    window.visualViewport?.removeEventListener?.('resize', handleViewportChange)
    window.visualViewport?.removeEventListener?.('scroll', handleViewportChange)
  })

  return {
    selectedRows,
    selectionAction,
    clearSelectionState,
    clearScheduledSelectionUpdate,
    handleSelectionMouseUp,
    scheduleSelectionUpdate,
    updateSelectionActionFromDom,
  }
}
