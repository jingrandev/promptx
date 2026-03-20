import { nextTick } from 'vue'

export function useTranscriptAutoScroll(options = {}) {
  const {
    transcriptRef,
    hasNewerMessages,
    threshold = 48,
  } = options

  let pendingScrollJobId = 0
  let pendingScrollFrameIds = []
  let stickToBottom = true

  function clearPendingScrollFrames() {
    if (typeof window === 'undefined' || !pendingScrollFrameIds.length) {
      pendingScrollFrameIds = []
      return
    }

    pendingScrollFrameIds.forEach((frameId) => {
      window.cancelAnimationFrame(frameId)
    })
    pendingScrollFrameIds = []
  }

  function cancelScheduledScrollToBottom() {
    pendingScrollJobId += 1
    clearPendingScrollFrames()
  }

  function resetAutoStickToBottom() {
    stickToBottom = true
    if (hasNewerMessages?.value !== undefined) {
      hasNewerMessages.value = false
    }
  }

  function isTranscriptNearBottom(element = transcriptRef?.value) {
    if (!element) {
      return true
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    return distanceToBottom <= threshold
  }

  function handleTranscriptScroll() {
    const nextStickToBottom = isTranscriptNearBottom()
    if (!nextStickToBottom) {
      cancelScheduledScrollToBottom()
    }

    stickToBottom = nextStickToBottom
    if (stickToBottom && hasNewerMessages?.value !== undefined) {
      hasNewerMessages.value = false
    }
  }

  function scheduleScrollToBottom(options = {}) {
    const { force = false } = options
    if (force) {
      resetAutoStickToBottom()
    }

    cancelScheduledScrollToBottom()
    const jobId = pendingScrollJobId

    nextTick(() => {
      const element = transcriptRef?.value
      if (!element || jobId !== pendingScrollJobId) {
        return
      }

      if (!force && !stickToBottom) {
        if (hasNewerMessages?.value !== undefined) {
          hasNewerMessages.value = true
        }
        return
      }

      const run = () => {
        const currentElement = transcriptRef?.value
        if (!currentElement || jobId !== pendingScrollJobId) {
          return
        }

        currentElement.scrollTop = currentElement.scrollHeight
        stickToBottom = true
        if (hasNewerMessages?.value !== undefined) {
          hasNewerMessages.value = false
        }
      }

      run()
      const firstFrameId = requestAnimationFrame(() => {
        run()
        const secondFrameId = requestAnimationFrame(run)
        pendingScrollFrameIds = [secondFrameId]
      })
      pendingScrollFrameIds = [firstFrameId]
    })
  }

  function scrollToBottom() {
    scheduleScrollToBottom({ force: true })
  }

  function destroy() {
    cancelScheduledScrollToBottom()
  }

  return {
    cancelScheduledScrollToBottom,
    destroy,
    handleTranscriptScroll,
    isTranscriptNearBottom,
    resetAutoStickToBottom,
    scheduleScrollToBottom,
    scrollToBottom,
  }
}
