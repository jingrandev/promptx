import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  createCodexSession,
  deleteCodexSession,
  listCodexSessions,
  listCodexWorkspaces,
  streamPromptToCodexSession,
  updateCodexSession,
} from '../lib/api.js'
import {
  deleteTranscript,
  getTranscript,
  setTranscript,
} from '../lib/transcriptStore.js'

const SESSION_REFRESH_TTL = 1500

function getDateOrderValue(value = '') {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function sortSessions(items = [], currentSessionId = '') {
  return [...items].sort((left, right) => {
    const runningDiff = Number(Boolean(right?.running)) - Number(Boolean(left?.running))
    if (runningDiff) {
      return runningDiff
    }

    const currentDiff = Number(right?.id === currentSessionId) - Number(left?.id === currentSessionId)
    if (currentDiff) {
      return currentDiff
    }

    const updatedDiff = getDateOrderValue(right.updatedAt) - getDateOrderValue(left.updatedAt)
    if (updatedDiff) {
      return updatedDiff
    }

    return String(left.title || left.cwd || left.id).localeCompare(String(right.title || right.cwd || right.id), 'zh-CN')
  })
}

function formatCommandOutput(output = '', limit = 500) {
  const text = String(output || '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit)}...`
}

function formatTodoItems(items = []) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) {
    return ''
  }

  return list
    .map((item) => `${item.completed ? '[x]' : '[ ]'} ${item.text || '未命名任务'}`)
    .join('\n')
}

export function formatCodexEvent(event = {}) {
  const eventType = String(event.type || '').trim()
  const item = event.item || {}

  if (!eventType) {
    return { title: '收到 Codex 事件', detail: '' }
  }

  if (eventType === 'thread.started') {
    return {
      title: 'Codex 线程已创建',
      detail: event.thread_id ? `线程 ID: ${event.thread_id}` : '',
    }
  }

  if (eventType === 'turn.started') {
    return { title: 'Codex 开始执行', detail: '' }
  }

  if (eventType === 'turn.completed') {
    const usage = event.usage
      ? `输入 ${event.usage.input_tokens || 0} / 输出 ${event.usage.output_tokens || 0}`
      : ''
    return {
      title: 'Codex 执行完成',
      detail: usage,
    }
  }

  if (eventType === 'item.started') {
    if (item.type === 'command_execution') {
      return {
        kind: 'command',
        title: '开始执行命令',
        detail: item.command || '',
      }
    }

    if (item.type === 'todo_list') {
      return {
        kind: 'todo',
        title: '更新待办列表',
        detail: formatTodoItems(item.items),
      }
    }

    return {
      title: `开始处理 ${item.type || '未知项目'}`,
      detail: '',
    }
  }

  if (eventType === 'item.updated' && item.type === 'todo_list') {
    return {
      kind: 'todo',
      title: '更新待办列表',
      detail: formatTodoItems(item.items),
    }
  }

  if (eventType === 'item.completed') {
    if (item.type === 'agent_message' && item.text) {
      return {
        kind: 'result',
        title: 'Codex 已返回结果',
        detail: '',
      }
    }

    if (item.type === 'command_execution') {
      const success = item.exit_code === 0 || item.status === 'completed'
      return {
        kind: success ? 'command' : 'error',
        title: success ? '命令执行完成' : `命令执行失败(exit ${item.exit_code ?? '?'})`,
        detail: [item.command, formatCommandOutput(item.aggregated_output)].filter(Boolean).join('\n\n'),
      }
    }

    if (item.type === 'todo_list') {
      return {
        kind: 'todo',
        title: '更新待办列表',
        detail: formatTodoItems(item.items),
      }
    }

    return {
      title: `完成 ${item.type || '未知项目'}`,
      detail: '',
    }
  }

  return {
    title: `事件: ${eventType}`,
    detail: '',
  }
}

export function getProcessStatus(turn) {
  if (turn.status === 'running') {
    return '进行中'
  }
  if (turn.status === 'error') {
    return '失败'
  }
  if (turn.status === 'stopped') {
    return '已停止'
  }
  return '已完成'
}

export async function restoreTurnsFromStorage(storageKey, options = {}) {
  const {
    getStoredTranscript = getTranscript,
    setStoredTranscript = setTranscript,
    storage = typeof window !== 'undefined' ? window.localStorage : null,
  } = options

  const key = String(storageKey || '').trim()
  if (!key) {
    return []
  }

  const indexedDbTurns = await getStoredTranscript(key)
  if (Array.isArray(indexedDbTurns)) {
    return indexedDbTurns
  }

  if (!storage) {
    return []
  }

  const raw = storage.getItem(key)
  const legacyTurns = raw ? JSON.parse(raw) : []
  if (Array.isArray(legacyTurns)) {
    await setStoredTranscript(key, legacyTurns)
    storage.removeItem(key)
    return legacyTurns
  }

  return []
}

export function useCodexSessionPanel(props, emit) {
  const sessions = ref([])
  const workspaces = ref([])
  const loading = ref(false)
  const managerBusy = ref(false)
  const sending = ref(false)
  const sessionError = ref('')
  const turns = ref([])
  const currentController = ref(null)
  const selectedSessionId = ref('')
  const transcriptRef = ref(null)
  const sendingStartedAt = ref(0)
  const sendingElapsedSeconds = ref(0)
  const showManager = ref(false)

  let turnId = 0
  let logId = 0
  let sendingTimer = null
  let sessionsLoadPromise = null
  let lastSessionsLoadedAt = 0
  let hydrateTurnsRequestId = 0
  let isHydratingTurns = false

  const hasPrompt = computed(() => {
    if (typeof props.buildPrompt === 'function') {
      return true
    }
    return Boolean(String(props.prompt || '').trim())
  })

  const hasSessions = computed(() => sessions.value.length > 0)
  const sortedSessions = computed(() => sortSessions(sessions.value, selectedSessionId.value))
  const selectedSession = computed(() => sessions.value.find((session) => session.id === selectedSessionId.value) || null)
  const helperText = computed(() => {
    if (!hasSessions.value) {
      return '还没有 PromptX 会话，请先在管理弹窗里新建一个固定工作目录。'
    }
    return ''
  })
  const workingLabel = computed(() => `处理中 (${sendingElapsedSeconds.value}s)`)

  function getTurnsStorageKey() {
    const base = String(props.storageKey || '').trim()
    return base ? `${base}:turns` : 'promptx:codex-turns'
  }

  function clearSendingTimer() {
    if (sendingTimer) {
      window.clearInterval(sendingTimer)
      sendingTimer = null
    }
  }

  function startSendingTimer() {
    sendingStartedAt.value = Date.now()
    sendingElapsedSeconds.value = 0
    clearSendingTimer()
    sendingTimer = window.setInterval(() => {
      sendingElapsedSeconds.value = Math.max(0, Math.floor((Date.now() - sendingStartedAt.value) / 1000))
    }, 1000)
  }

  function formatTurnTime(value = '') {
    if (!value) {
      return ''
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  function normalizeLogEntry(entry) {
    if (!entry) {
      return null
    }

    if (typeof entry === 'string') {
      const text = entry.trim()
      if (!text) {
        return null
      }
      return {
        id: ++logId,
        kind: 'info',
        title: text,
        detail: '',
      }
    }

    const title = String(entry.title || '').trim()
    const detail = String(entry.detail || '').trim()
    if (!title && !detail) {
      return null
    }

    return {
      id: ++logId,
      kind: entry.kind || 'info',
      title: title || detail,
      detail: title ? detail : '',
    }
  }

  function scheduleScrollToBottom() {
    nextTick(() => {
      if (!transcriptRef.value) {
        return
      }

      const run = () => {
        if (!transcriptRef.value) {
          return
        }
        transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight
      }

      run()
      requestAnimationFrame(() => {
        run()
        requestAnimationFrame(run)
      })
    })
  }

  function scrollToBottom() {
    scheduleScrollToBottom()
  }

  function appendTurnEvent(turn, entry) {
    const normalized = normalizeLogEntry(entry)
    if (!normalized) {
      return
    }

    turn.events.push(normalized)
    if (turn.events.length > 120) {
      turn.events.splice(0, turn.events.length - 120)
    }
    scheduleScrollToBottom()
  }

  function createTurn(promptText) {
    const turn = reactive({
      id: ++turnId,
      prompt: String(promptText || '').trim(),
      status: 'running',
      startedAt: new Date().toISOString(),
      events: [],
      responseMessage: '',
      errorMessage: '',
    })
    turns.value.push(turn)
    scheduleScrollToBottom()
    return turn
  }

  function getProcessCardClass(turn) {
    if (turn.status === 'error') {
      return 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
    }
    if (turn.status === 'stopped') {
      return 'border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'
    }
    if (turn.status === 'completed') {
      return 'border-stone-300 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
    }
    return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
  }

  function shouldShowResponse(turn) {
    return Boolean(turn.responseMessage || turn.errorMessage || turn.status === 'completed')
  }

  function mergeSession(nextSession) {
    if (!nextSession?.id) {
      return
    }

    const nextList = [...sessions.value]
    const index = nextList.findIndex((item) => item.id === nextSession.id)
    if (index >= 0) {
      nextList[index] = nextSession
    } else {
      nextList.unshift(nextSession)
    }
    sessions.value = nextList
  }

  function handleStreamEvent(payload = {}, turn) {
    if (payload.type === 'session') {
      mergeSession(payload.session)
      appendTurnEvent(turn, {
        title: `已连接 PromptX 会话：${payload.session?.title || '未命名会话'}`,
        detail: payload.session?.cwd ? `工作目录：${payload.session.cwd}` : '',
      })
      return
    }

    if (payload.type === 'session.updated') {
      mergeSession(payload.session)
      appendTurnEvent(turn, {
        title: '会话线程已更新',
        detail: payload.session?.started ? '后续请求会继续复用当前 PromptX 会话。' : '',
      })
      return
    }

    if (payload.type === 'status') {
      appendTurnEvent(turn, {
        title: payload.message || '状态已更新',
        detail: '',
      })
      return
    }

    if (payload.type === 'stderr') {
      appendTurnEvent(turn, {
        kind: 'error',
        title: 'stderr',
        detail: payload.text,
      })
      return
    }

    if (payload.type === 'stdout') {
      appendTurnEvent(turn, {
        kind: 'command',
        title: 'stdout',
        detail: payload.text,
      })
      return
    }

    if (payload.type === 'codex') {
      appendTurnEvent(turn, formatCodexEvent(payload.event))
      if (payload.event?.type === 'item.completed' && payload.event?.item?.type === 'agent_message' && payload.event?.item?.text) {
        turn.responseMessage = payload.event.item.text
      }
      return
    }

    if (payload.type === 'completed') {
      turn.status = 'completed'
      if (payload.message) {
        turn.responseMessage = payload.message
      }
      if (!turn.responseMessage) {
        turn.responseMessage = '本轮 Codex 执行已完成，没有返回额外文本。'
      }
      appendTurnEvent(turn, {
        kind: 'result',
        title: '本轮执行结束',
        detail: '',
      })
      return
    }

    if (payload.type === 'error') {
      turn.status = 'error'
      turn.errorMessage = payload.message || 'Codex 执行失败'
      appendTurnEvent(turn, {
        kind: 'error',
        title: '执行失败',
        detail: turn.errorMessage,
      })
    }
  }

  function hydrateSelectedSession() {
    if (!props.storageKey) {
      selectedSessionId.value = ''
      return
    }

    selectedSessionId.value = window.localStorage.getItem(props.storageKey) || ''
  }

  function normalizeHydratedTurns(items) {
    const nextTurns = Array.isArray(items) ? items : []
    turns.value = nextTurns
    turnId = nextTurns.reduce((maxId, turn) => Math.max(maxId, Number(turn?.id) || 0), 0)
    logId = nextTurns.reduce((maxId, turn) => {
      const eventMaxId = Array.isArray(turn?.events)
        ? turn.events.reduce((eventMax, event) => Math.max(eventMax, Number(event?.id) || 0), 0)
        : 0
      return Math.max(maxId, eventMaxId)
    }, 0)
  }

  async function hydrateTurns() {
    const storageKey = getTurnsStorageKey()
    if (typeof window === 'undefined' || !storageKey) {
      normalizeHydratedTurns([])
      return
    }

    const requestId = ++hydrateTurnsRequestId
    isHydratingTurns = true

    try {
      const restoredTurns = await restoreTurnsFromStorage(storageKey)
      if (requestId !== hydrateTurnsRequestId) {
        return
      }
      normalizeHydratedTurns(restoredTurns)
    } catch {
      normalizeHydratedTurns([])
    } finally {
      if (requestId === hydrateTurnsRequestId) {
        isHydratingTurns = false
      }
    }
  }

  function persistSelectedSession(sessionId) {
    if (!props.storageKey) {
      return
    }

    if (sessionId) {
      window.localStorage.setItem(props.storageKey, sessionId)
    } else {
      window.localStorage.removeItem(props.storageKey)
    }
  }

  async function persistTurns() {
    const storageKey = getTurnsStorageKey()
    if (typeof window === 'undefined' || !storageKey) {
      return
    }

    try {
      if (!turns.value.length) {
        await deleteTranscript(storageKey)
        window.localStorage.removeItem(storageKey)
        return
      }

      await setTranscript(storageKey, turns.value)
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore storage failures
    }
  }

  async function loadSessions(options = {}) {
    const { force = false } = options

    if (sessionsLoadPromise) {
      return sessionsLoadPromise
    }

    const now = Date.now()
    if (!force && lastSessionsLoadedAt && now - lastSessionsLoadedAt < SESSION_REFRESH_TTL) {
      return {
        items: sessions.value,
        workspaces: workspaces.value,
      }
    }

    sessionsLoadPromise = (async () => {
      loading.value = true
      sessionError.value = ''

      try {
        const [sessionPayload, workspacePayload] = await Promise.all([
          listCodexSessions(),
          listCodexWorkspaces(),
        ])
        const nextSessions = sessionPayload.items || []

        sessions.value = nextSessions
        workspaces.value = workspacePayload.items || []
        lastSessionsLoadedAt = Date.now()

        if (selectedSessionId.value && nextSessions.some((session) => session.id === selectedSessionId.value)) {
          return {
            items: nextSessions,
            workspaces: workspaces.value,
          }
        }

        if (selectedSessionId.value) {
          selectedSessionId.value = ''
        }

        return {
          items: nextSessions,
          workspaces: workspaces.value,
        }
      } catch (err) {
        sessionError.value = err.message
        throw err
      } finally {
        loading.value = false
        sessionsLoadPromise = null
      }
    })()

    return sessionsLoadPromise
  }

  function upsertWorkspace(cwd = '') {
    const normalized = String(cwd || '').trim()
    if (!normalized || workspaces.value.includes(normalized)) {
      return
    }
    workspaces.value = [normalized, ...workspaces.value]
  }

  function openManager() {
    showManager.value = true
  }

  function closeManager() {
    showManager.value = false
  }

  function handleSelectSession(sessionId) {
    selectedSessionId.value = String(sessionId || '').trim()
  }

  function refreshSessionsForSelection() {
    loadSessions().catch(() => {})
  }

  async function handleCreateSession(payload) {
    managerBusy.value = true
    sessionError.value = ''

    try {
      const session = await createCodexSession(payload)
      mergeSession(session)
      upsertWorkspace(session.cwd)
      selectedSessionId.value = session.id
      return session
    } catch (err) {
      sessionError.value = err.message
      throw err
    } finally {
      managerBusy.value = false
    }
  }

  async function handleUpdateSession(sessionId, payload) {
    managerBusy.value = true
    sessionError.value = ''

    try {
      const session = await updateCodexSession(sessionId, payload)
      mergeSession(session)
      upsertWorkspace(session.cwd)
      return session
    } catch (err) {
      sessionError.value = err.message
      throw err
    } finally {
      managerBusy.value = false
    }
  }

  async function handleDeleteSession(sessionId) {
    const targetId = String(sessionId || '').trim()
    if (!targetId) {
      return {
        deletedSessionId: '',
        selectedSessionId: selectedSessionId.value,
      }
    }

    managerBusy.value = true
    sessionError.value = ''

    try {
      await deleteCodexSession(targetId)
      const remainingSessions = sessions.value.filter((session) => session.id !== targetId)
      sessions.value = remainingSessions

      let nextSelectedSessionId = selectedSessionId.value
      if (selectedSessionId.value === targetId) {
        nextSelectedSessionId = sortSessions(remainingSessions, '')[0]?.id || ''
        selectedSessionId.value = nextSelectedSessionId
      }

      return {
        deletedSessionId: targetId,
        selectedSessionId: nextSelectedSessionId,
      }
    } catch (err) {
      sessionError.value = err.message
      throw err
    } finally {
      managerBusy.value = false
    }
  }

  async function handleSend() {
    if (!hasPrompt.value || sending.value) {
      return false
    }

    if (!selectedSessionId.value) {
      openManager()
      sessionError.value = '请先选择一个 PromptX 会话。'
      return false
    }

    sessionError.value = ''

    try {
      await loadSessions()

      const latestSelectedSession = sessions.value.find((session) => session.id === selectedSessionId.value) || null
      if (!latestSelectedSession) {
        sessionError.value = '当前会话不存在，请重新选择。'
        return false
      }

      if (latestSelectedSession.running) {
        sessionError.value = '当前会话正在执行中，请等待完成后再发送。'
        return false
      }

      if (typeof props.beforeSend === 'function') {
        const ready = await props.beforeSend()
        if (ready === false) {
          return false
        }
      }

      const prompt = typeof props.buildPrompt === 'function'
        ? await props.buildPrompt()
        : props.prompt

      if (!String(prompt || '').trim()) {
        sessionError.value = '没有可发送的提示词。'
        return false
      }

      const session = sessions.value.find((item) => item.id === selectedSessionId.value) || null
      if (!session) {
        sessionError.value = '当前会话不存在，请重新选择。'
        return false
      }

      sending.value = true
      const controller = new AbortController()
      const turn = createTurn(prompt)
      currentController.value = controller

      ;(async () => {
        try {
          await streamPromptToCodexSession(selectedSessionId.value, {
            prompt,
          }, {
            signal: controller.signal,
            onEvent(payload) {
              handleStreamEvent(payload, turn)
            },
          })
        } catch (err) {
          if (err.name === 'AbortError') {
            turn.status = 'stopped'
            appendTurnEvent(turn, {
              title: '执行已手动停止',
              detail: '',
            })
          } else {
            turn.status = 'error'
            turn.errorMessage = err.message
            appendTurnEvent(turn, {
              kind: 'error',
              title: '执行失败',
              detail: turn.errorMessage,
            })
          }
        } finally {
          sending.value = false
          currentController.value = null
        }
      })()

      return true
    } catch (err) {
      sessionError.value = err.message
      return false
    }
  }

  function stopSending() {
    currentController.value?.abort()
  }

  function clearTurns() {
    turns.value = []
  }

  watch(
    sending,
    (value) => {
      if (value) {
        startSendingTimer()
        scheduleScrollToBottom()
      } else {
        clearSendingTimer()
        sendingStartedAt.value = 0
        sendingElapsedSeconds.value = 0
      }
      emit('sending-change', value)
    },
    { immediate: true }
  )

  watch(selectedSessionId, persistSelectedSession)

  watch(
    selectedSession,
    (session) => {
      emit('selected-session-change', session || null)
    },
    { immediate: true }
  )

  watch(
    () => props.storageKey,
    () => {
      hydrateSelectedSession()
      hydrateTurns()
      loadSessions().catch(() => {})
    },
    { immediate: true }
  )

  watch(
    () => props.active,
    (active, previousActive) => {
      if (!active || previousActive) {
        return
      }

      loadSessions({ force: true }).catch(() => {})
    }
  )

  watch(
    turns,
    () => {
      if (isHydratingTurns) {
        return
      }
      persistTurns()
      scheduleScrollToBottom()
    },
    { deep: true, flush: 'post' }
  )

  onBeforeUnmount(() => {
    clearSendingTimer()
  })

  return {
    clearTurns,
    closeManager,
    formatTurnTime,
    getProcessCardClass,
    getProcessStatus,
    handleCreateSession,
    handleDeleteSession,
    handleSelectSession,
    handleSend,
    handleUpdateSession,
    helperText,
    loading,
    managerBusy,
    openManager,
    refreshSessionsForSelection,
    scheduleScrollToBottom,
    selectedSessionId,
    sending,
    sessionError,
    shouldShowResponse,
    showManager,
    sortedSessions,
    stopSending,
    transcriptRef,
    turns,
    workspaces,
    workingLabel,
    sessions,
    loadSessions,
    scrollToBottom,
  }
}
