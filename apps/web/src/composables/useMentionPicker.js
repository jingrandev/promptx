import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export function useMentionPicker(options) {
  const {
    activeIndex,
    blocks,
    isTextLikeBlock,
    placeCursor,
    resizeAllTextareas,
    selectionMap,
    sessionId,
    setBlocks,
    textareas,
  } = options

  const mentionState = ref(createMentionState())
  const mentionAnchorRect = ref(null)
  const mentionDismissedState = ref(null)

  function createMentionState() {
    return {
      open: false,
      blockIndex: -1,
      start: 0,
      end: 0,
      query: '',
      trigger: 'mention',
    }
  }

  function getMentionAnchorRect(index, position) {
    const textarea = textareas.value[index]
    if (!textarea || typeof document === 'undefined') {
      return null
    }

    const computedStyle = window.getComputedStyle(textarea)
    const mirror = document.createElement('div')
    const marker = document.createElement('span')
    const properties = [
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontSizeAdjust',
      'lineHeight',
      'fontFamily',
      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',
      'letterSpacing',
      'wordSpacing',
      'tabSize',
    ]

    mirror.style.position = 'fixed'
    mirror.style.left = '-9999px'
    mirror.style.top = '0'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'

    properties.forEach((property) => {
      mirror.style[property] = computedStyle[property]
    })

    const beforeText = textarea.value.slice(0, position)
    const markerText = textarea.value.slice(position, position + 1) || ' '
    const afterText = textarea.value.slice(position + 1)

    mirror.textContent = beforeText
    marker.textContent = markerText
    mirror.appendChild(marker)
    if (afterText) {
      mirror.appendChild(document.createTextNode(afterText))
    }
    document.body.appendChild(mirror)

    const textareaRect = textarea.getBoundingClientRect()
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.4 || 20
    const left = textareaRect.left + marker.offsetLeft - textarea.scrollLeft
    const top = textareaRect.top + marker.offsetTop - textarea.scrollTop

    document.body.removeChild(mirror)

    return {
      left,
      top,
      right: left,
      bottom: top + lineHeight,
      width: 0,
      height: lineHeight,
    }
  }

  function hasAnchorRectChanged(nextRect, currentRect) {
    if (!nextRect && !currentRect) {
      return false
    }

    if (!nextRect || !currentRect) {
      return true
    }

    return Math.abs((nextRect.left || 0) - (currentRect.left || 0)) >= 1
      || Math.abs((nextRect.top || 0) - (currentRect.top || 0)) >= 1
      || Math.abs((nextRect.bottom || 0) - (currentRect.bottom || 0)) >= 1
  }

  function updateMentionAnchor() {
    const state = mentionState.value
    if (!state.open || state.blockIndex < 0) {
      mentionAnchorRect.value = null
      return
    }

    const nextAnchorRect = getMentionAnchorRect(state.blockIndex, state.start)
    if (hasAnchorRectChanged(nextAnchorRect, mentionAnchorRect.value)) {
      mentionAnchorRect.value = nextAnchorRect
    }
  }

  function removeShortcutMention(state) {
    const blockIndex = Number(state?.blockIndex)
    if (blockIndex < 0) {
      return
    }

    const currentBlock = blocks.value[blockIndex]
    if (!currentBlock || !isTextLikeBlock(currentBlock)) {
      return
    }

    const start = Math.max(0, Number(state.start) || 0)
    const end = Math.max(start, Number(state.end) || start)
    const nextContent = `${currentBlock.content.slice(0, start)}${currentBlock.content.slice(end)}`
    const nextBlocks = [...blocks.value]

    nextBlocks.splice(blockIndex, 1, {
      ...currentBlock,
      content: nextContent,
    })
    setBlocks(nextBlocks)
    activeIndex.value = blockIndex
    selectionMap.value[blockIndex] = {
      start,
      end: start,
    }
    nextTick(() => placeCursor(blockIndex, start))
  }

  function closeMentionPicker(options = {}) {
    const { suppressCurrent = false, cleanupShortcut = false } = options
    const currentState = mentionState.value

    if (suppressCurrent && currentState.open) {
      mentionDismissedState.value = {
        blockIndex: currentState.blockIndex,
        start: currentState.start,
        end: currentState.end,
        query: currentState.query,
        trigger: currentState.trigger,
      }
    }

    mentionState.value = createMentionState()
    mentionAnchorRect.value = null

    if (cleanupShortcut && currentState.trigger === 'shortcut') {
      removeShortcutMention(currentState)
    }
  }

  function dismissMentionPicker() {
    closeMentionPicker({
      suppressCurrent: true,
      cleanupShortcut: mentionState.value.trigger === 'shortcut',
    })
  }

  function syncMentionState(index, target) {
    const element = target || textareas.value[index]
    const currentBlock = blocks.value[index]

    if (!element || !currentBlock || !isTextLikeBlock(currentBlock)) {
      if (mentionState.value.blockIndex === index) {
        closeMentionPicker()
      }
      return
    }

    const selectionStart = element.selectionStart ?? 0
    const selectionEnd = element.selectionEnd ?? 0
    if (selectionStart !== selectionEnd) {
      if (mentionState.value.blockIndex === index) {
        closeMentionPicker()
      }
      return
    }

    const content = String(currentBlock.content || '')
    const beforeCaret = content.slice(0, selectionEnd)
    const mentionStart = beforeCaret.lastIndexOf('@')

    if (mentionStart < 0) {
      if (mentionState.value.blockIndex === index) {
        closeMentionPicker()
      }
      return
    }

    const mentionQuery = beforeCaret.slice(mentionStart + 1)
    if (/\s/.test(mentionQuery)) {
      if (mentionState.value.blockIndex === index) {
        closeMentionPicker()
      }
      return
    }

    const nextStart = mentionStart
    const dismissed = mentionDismissedState.value
    if (
      dismissed
      && dismissed.blockIndex === index
      && dismissed.start === nextStart
      && dismissed.end === selectionEnd
      && dismissed.query === mentionQuery
    ) {
      return
    }

    mentionDismissedState.value = null
    const anchorChanged = !mentionState.value.open
      || mentionState.value.blockIndex !== index
      || mentionState.value.start !== nextStart
    const nextAnchorRect = getMentionAnchorRect(index, nextStart)
    const nextTrigger = mentionState.value.open
      && mentionState.value.blockIndex === index
      && mentionState.value.start === nextStart
      ? mentionState.value.trigger || 'mention'
      : 'mention'

    mentionState.value = {
      open: true,
      blockIndex: index,
      start: nextStart,
      end: selectionEnd,
      query: mentionQuery,
      trigger: nextTrigger,
    }

    if (anchorChanged || hasAnchorRectChanged(nextAnchorRect, mentionAnchorRect.value)) {
      mentionAnchorRect.value = nextAnchorRect
    }
  }

  function recordSelection(index, event) {
    selectionMap.value[index] = {
      start: event.target.selectionStart ?? 0,
      end: event.target.selectionEnd ?? 0,
    }
    syncMentionState(index, event.target)
  }

  function handleTextFocus(index) {
    activeIndex.value = index
    const target = textareas.value[index]
    selectionMap.value[index] = {
      start: target?.selectionStart ?? 0,
      end: target?.selectionEnd ?? 0,
    }
    syncMentionState(index, target)
  }

  function openPathPickerFromShortcut() {
    const currentIndex = Math.min(activeIndex.value ?? 0, Math.max(blocks.value.length - 1, 0))
    const currentBlock = blocks.value[currentIndex]
    if (!currentBlock || !isTextLikeBlock(currentBlock)) {
      return false
    }

    const target = textareas.value[currentIndex]
    const fallbackPosition = currentBlock.content.length
    const selection = {
      start: target?.selectionStart ?? selectionMap.value[currentIndex]?.start ?? fallbackPosition,
      end: target?.selectionEnd ?? selectionMap.value[currentIndex]?.end ?? fallbackPosition,
    }
    const start = Math.max(0, selection.start ?? 0)
    const end = Math.max(start, selection.end ?? start)
    const nextContent = `${currentBlock.content.slice(0, start)}@${currentBlock.content.slice(end)}`
    const nextCursor = start + 1
    const nextBlocks = [...blocks.value]

    nextBlocks.splice(currentIndex, 1, {
      ...currentBlock,
      content: nextContent,
    })
    setBlocks(nextBlocks)
    activeIndex.value = currentIndex
    selectionMap.value[currentIndex] = {
      start: nextCursor,
      end: nextCursor,
    }
    mentionDismissedState.value = null

    nextTick(() => {
      placeCursor(currentIndex, nextCursor)
      mentionState.value = {
        open: true,
        blockIndex: currentIndex,
        start,
        end: nextCursor,
        query: '',
        trigger: 'shortcut',
      }
      mentionAnchorRect.value = getMentionAnchorRect(currentIndex, start)
    })
    return true
  }

  function applyMentionSelection(item) {
    const pathValue = String(item?.path || '').trim()
    const state = mentionState.value

    if (!pathValue || state.blockIndex < 0) {
      closeMentionPicker()
      return false
    }

    const currentBlock = blocks.value[state.blockIndex]
    if (!currentBlock || !isTextLikeBlock(currentBlock)) {
      closeMentionPicker()
      return false
    }

    const insertedValue = state.trigger === 'shortcut'
      ? `${pathValue} `
      : `@${pathValue} `
    const nextContent = `${currentBlock.content.slice(0, state.start)}${insertedValue}${currentBlock.content.slice(state.end)}`
    const nextCursor = state.start + insertedValue.length
    const nextBlocks = [...blocks.value]

    nextBlocks.splice(state.blockIndex, 1, {
      ...currentBlock,
      content: nextContent,
    })

    setBlocks(nextBlocks)
    activeIndex.value = state.blockIndex
    selectionMap.value[state.blockIndex] = {
      start: nextCursor,
      end: nextCursor,
    }
    mentionDismissedState.value = null
    closeMentionPicker()
    nextTick(() => placeCursor(state.blockIndex, nextCursor))
    return true
  }

  function handleViewportChange() {
    if (!mentionState.value.open) {
      return
    }
    updateMentionAnchor()
  }

  watch(
    () => sessionId?.value ?? sessionId,
    () => {
      closeMentionPicker()
    }
  )

  watch(
    () => mentionState.value.open,
    (open) => {
      if (open) {
        return
      }

      nextTick(() => {
        resizeAllTextareas?.()
      })
    }
  )

  onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange)
  })

  return {
    mentionState,
    mentionAnchorRect,
    applyMentionSelection,
    closeMentionPicker,
    dismissMentionPicker,
    handleTextFocus,
    openPathPickerFromShortcut,
    recordSelection,
    syncMentionState,
    updateMentionAnchor,
  }
}
