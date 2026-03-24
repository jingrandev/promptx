import fs from 'node:fs'
import path from 'node:path'

import { ensurePromptxStorageReady } from './appPaths.js'

const DEFAULT_RETENTION_DAYS = 90
const DEFAULT_FLUSH_DELAY_MS = 300

function getLocalDateKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clampRetentionDays(value) {
  return Math.max(1, Number(value) || DEFAULT_RETENTION_DAYS)
}

function buildDefaultState() {
  return {
    version: 1,
    updatedAt: '',
    days: {},
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function normalizeEntry(raw = {}, tenantKey = '') {
  return {
    tenantKey: String(raw?.tenantKey || tenantKey || '').trim(),
    host: String(raw?.host || '').trim(),
    firstSeenAt: String(raw?.firstSeenAt || '').trim(),
    lastSeenAt: String(raw?.lastSeenAt || '').trim(),
    lastConnectAt: String(raw?.lastConnectAt || '').trim(),
    lastRequestAt: String(raw?.lastRequestAt || '').trim(),
    lastDeviceId: String(raw?.lastDeviceId || '').trim(),
    connectCount: Math.max(0, Number(raw?.connectCount) || 0),
    proxyRequestCount: Math.max(0, Number(raw?.proxyRequestCount) || 0),
    apiRequestCount: Math.max(0, Number(raw?.apiRequestCount) || 0),
    uploadRequestCount: Math.max(0, Number(raw?.uploadRequestCount) || 0),
  }
}

function normalizeState(raw = {}) {
  const next = buildDefaultState()
  const days = raw && typeof raw === 'object' ? raw.days : null
  if (!days || typeof days !== 'object') {
    return next
  }

  Object.entries(days).forEach(([dateKey, entries]) => {
    if (!entries || typeof entries !== 'object') {
      return
    }
    next.days[dateKey] = Object.fromEntries(
      Object.entries(entries)
        .map(([tenantKey, item]) => [tenantKey, normalizeEntry(item, tenantKey)])
        .filter(([, item]) => item.tenantKey)
    )
  })

  next.updatedAt = String(raw?.updatedAt || '').trim()
  return next
}

function sortEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const rightSeen = Date.parse(right.lastSeenAt || '') || 0
    const leftSeen = Date.parse(left.lastSeenAt || '') || 0
    if (rightSeen !== leftSeen) {
      return rightSeen - leftSeen
    }
    if ((right.proxyRequestCount || 0) !== (left.proxyRequestCount || 0)) {
      return (right.proxyRequestCount || 0) - (left.proxyRequestCount || 0)
    }
    return String(left.tenantKey || '').localeCompare(String(right.tenantKey || ''))
  })
}

function summarizeDay(dateKey, entryMap = {}) {
  const tenants = sortEntries(Object.values(entryMap || {}))
  return {
    date: dateKey,
    tenantCount: tenants.length,
    connectCount: tenants.reduce((sum, item) => sum + (item.connectCount || 0), 0),
    proxyRequestCount: tenants.reduce((sum, item) => sum + (item.proxyRequestCount || 0), 0),
    apiRequestCount: tenants.reduce((sum, item) => sum + (item.apiRequestCount || 0), 0),
    uploadRequestCount: tenants.reduce((sum, item) => sum + (item.uploadRequestCount || 0), 0),
    tenants,
  }
}

function createFileWriter(filePath) {
  let flushTimer = null
  let pendingState = null

  function flushNow() {
    if (!pendingState) {
      return
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(pendingState, null, 2)}\n`, 'utf8')
    pendingState = null
  }

  return {
    schedule(state) {
      pendingState = state
      if (flushTimer) {
        return
      }
      flushTimer = setTimeout(() => {
        flushTimer = null
        flushNow()
      }, DEFAULT_FLUSH_DELAY_MS)
      flushTimer.unref?.()
    },
    flush() {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flushNow()
    },
  }
}

export function getDefaultRelayUsageFilePath() {
  const { dataDir } = ensurePromptxStorageReady()
  return path.join(dataDir, 'relay-usage.json')
}

export function createRelayUsageStore(options = {}) {
  const filePath = path.resolve(String(options.filePath || getDefaultRelayUsageFilePath()).trim())
  const retentionDays = clampRetentionDays(options.retentionDays)
  const now = typeof options.now === 'function' ? options.now : () => new Date()
  const writer = createFileWriter(filePath)
  let state = normalizeState(safeReadJson(filePath))

  function markDirty() {
    state.updatedAt = new Date(now()).toISOString()
    writer.schedule(state)
  }

  function prune() {
    const keys = Object.keys(state.days || {}).sort()
    if (keys.length <= retentionDays) {
      return
    }
    const toDelete = keys.slice(0, Math.max(0, keys.length - retentionDays))
    toDelete.forEach((key) => {
      delete state.days[key]
    })
  }

  function ensureDayEntry(dateKey, tenantKey) {
    if (!state.days[dateKey]) {
      state.days[dateKey] = {}
    }
    if (!state.days[dateKey][tenantKey]) {
      state.days[dateKey][tenantKey] = normalizeEntry({ tenantKey }, tenantKey)
    }
    return state.days[dateKey][tenantKey]
  }

  function record(event = {}) {
    const tenantKey = String(event?.tenantKey || '').trim()
    if (!tenantKey) {
      return null
    }

    const at = new Date(event?.at || now())
    const atIso = at.toISOString()
    const dateKey = getLocalDateKey(at)
    const entry = ensureDayEntry(dateKey, tenantKey)

    entry.tenantKey = tenantKey
    entry.host = String(event?.host || entry.host || '').trim()
    entry.lastDeviceId = String(event?.deviceId || entry.lastDeviceId || '').trim()
    entry.firstSeenAt = entry.firstSeenAt || atIso
    entry.lastSeenAt = atIso

    const type = String(event?.type || '').trim()
    if (type === 'connect') {
      entry.connectCount += 1
      entry.lastConnectAt = atIso
    }

    if (type === 'proxy_request') {
      entry.proxyRequestCount += 1
      entry.lastRequestAt = atIso
      const requestPath = String(event?.path || '').trim()
      if (requestPath.startsWith('/api/')) {
        entry.apiRequestCount += 1
      } else if (requestPath.startsWith('/uploads/')) {
        entry.uploadRequestCount += 1
      }
    }

    prune()
    markDirty()
    return { dateKey, entry: { ...entry } }
  }

  function getReport({ days = 7, today = now() } = {}) {
    const todayKey = getLocalDateKey(today)
    const availableKeys = Object.keys(state.days || {}).sort().reverse()
    const selectedKeys = availableKeys.slice(0, Math.max(1, Number(days) || 7))
    const dayBuckets = selectedKeys.map((dateKey) => summarizeDay(dateKey, state.days[dateKey]))
    const todayBucket = dayBuckets.find((item) => item.date === todayKey) || summarizeDay(todayKey, state.days[todayKey] || {})

    return {
      generatedAt: new Date(now()).toISOString(),
      today: todayBucket,
      recentDays: dayBuckets,
      filePath,
      retentionDays,
    }
  }

  return {
    filePath,
    record,
    getReport,
    flush() {
      writer.flush()
    },
  }
}

export {
  getLocalDateKey,
}
