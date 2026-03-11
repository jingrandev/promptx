import { onBeforeUnmount, ref } from 'vue'

export function useToast(duration = 2200) {
  const toastMessage = ref('')
  let toastTimer = null

  function clearToast() {
    if (toastTimer) {
      window.clearTimeout(toastTimer)
      toastTimer = null
    }
    toastMessage.value = ''
  }

  function flashToast(message, nextDuration = duration) {
    toastMessage.value = message
    if (toastTimer) {
      window.clearTimeout(toastTimer)
    }
    toastTimer = window.setTimeout(() => {
      toastMessage.value = ''
      toastTimer = null
    }, nextDuration)
  }

  onBeforeUnmount(() => {
    if (toastTimer) {
      window.clearTimeout(toastTimer)
    }
  })

  return {
    toastMessage,
    flashToast,
    clearToast,
  }
}
