import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEFAULT_TIMEOUT_MS = Math.max(1_000, Number(process.env.PROMPTX_GIT_DIFF_TIMEOUT_MS) || 60_000)
const DEFAULT_MAX_WORKERS = Math.max(1, Number(process.env.PROMPTX_GIT_DIFF_WORKER_POOL_SIZE) || 2)
const MAX_STDERR_LENGTH = 4000

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const workerEntryPath = path.join(currentDir, 'gitDiffWorker.js')

let nextRequestId = 1
let nextWorkerId = 1
const workerPool = []
const requestQueue = []
const requestMap = new Map()
const activeRequests = new Map()
const workerMetrics = {
  startedAt: new Date().toISOString(),
  spawnCount: 0,
  restartCount: 0,
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  timeoutRequests: 0,
  lastWorkerSpawnedAt: '',
  lastWorkerExitAt: '',
  lastWorkerExitCode: null,
  lastWorkerExitSignal: '',
  lastWorkerExitReason: '',
  lastRequest: null,
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`git diff 计算超时（>${timeoutMs}ms）。`)
  error.code = 'GIT_DIFF_TIMEOUT'
  error.statusCode = 504
  return error
}

function createWorkerError(message = '') {
  const error = new Error(message || 'git diff 计算失败。')
  error.code = 'GIT_DIFF_FAILED'
  error.statusCode = 500
  return error
}

function createLastRequestSnapshot(request = {}, patch = {}) {
  return {
    requestId: String(request.requestId || patch.requestId || '').trim(),
    taskSlug: String(request.taskSlug || patch.taskSlug || '').trim(),
    scope: String(request.scope || patch.scope || '').trim(),
    filePath: String(request.filePath || patch.filePath || '').trim(),
    startedAt: String(request.startedAt || patch.startedAt || '').trim(),
    finishedAt: String(patch.finishedAt || '').trim(),
    durationMs: Math.max(0, Number(patch.durationMs) || 0),
    status: String(patch.status || '').trim(),
    timeout: Boolean(patch.timeout),
    errorMessage: String(patch.errorMessage || '').trim(),
  }
}

function markLastRequest(request = {}, patch = {}) {
  workerMetrics.lastRequest = createLastRequestSnapshot(request, patch)
}

function getNowIso() {
  return new Date().toISOString()
}

function getRequestDurationMs(request = {}) {
  const startedAt = Date.parse(String(request.requestMeta?.startedAt || ''))
  return Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0
}

function getWorkerIndex(workerId = '') {
  return workerPool.findIndex((worker) => worker.id === workerId)
}

function getWorkerById(workerId = '') {
  const index = getWorkerIndex(workerId)
  return index >= 0 ? workerPool[index] : null
}

function removeWorker(worker) {
  const index = getWorkerIndex(worker?.id)
  if (index >= 0) {
    workerPool.splice(index, 1)
  }
}

function clearRequestTimer(request) {
  if (request?.timer) {
    clearTimeout(request.timer)
    request.timer = null
  }
}

function removeQueuedRequest(requestId = '') {
  const index = requestQueue.findIndex((request) => request.requestId === requestId)
  if (index >= 0) {
    requestQueue.splice(index, 1)
  }
}

function updateWorkerExitMetrics({ code = null, signal = '', reason = '' } = {}) {
  workerMetrics.lastWorkerExitAt = getNowIso()
  workerMetrics.lastWorkerExitCode = typeof code === 'number' ? code : null
  workerMetrics.lastWorkerExitSignal = String(signal || '').trim()
  workerMetrics.lastWorkerExitReason = String(reason || '').trim()
}

function finalizeRequest(request, handler) {
  if (!request || request.settled) {
    return
  }

  request.settled = true
  clearRequestTimer(request)
  removeQueuedRequest(request.requestId)
  requestMap.delete(request.requestId)
  activeRequests.delete(request.requestId)
  handler(request)
}

function rejectRequestWithError(request, error) {
  finalizeRequest(request, (pending) => {
    workerMetrics.failedRequests += 1
    markLastRequest(pending.requestMeta, {
      finishedAt: getNowIso(),
      durationMs: getRequestDurationMs(pending),
      status: error?.code === 'GIT_DIFF_TIMEOUT' ? 'timeout' : 'failed',
      timeout: error?.code === 'GIT_DIFF_TIMEOUT',
      errorMessage: String(error?.message || error || 'git diff request failed'),
    })
    pending.reject(error)
  })
}

function resolveRequest(request, value) {
  finalizeRequest(request, (pending) => {
    workerMetrics.completedRequests += 1
    markLastRequest(pending.requestMeta, {
      finishedAt: getNowIso(),
      durationMs: getRequestDurationMs(pending),
      status: 'completed',
    })
    pending.resolve(value)
  })
}

function createWorkerState(child) {
  return {
    id: `git-diff-worker-${nextWorkerId++}`,
    child,
    stdoutBuffer: '',
    stderrBuffer: '',
    activeRequestId: '',
    startedAt: getNowIso(),
    stopping: false,
  }
}

function appendWorkerStderr(worker, chunk) {
  worker.stderrBuffer = `${worker.stderrBuffer}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')}`
  if (worker.stderrBuffer.length > MAX_STDERR_LENGTH) {
    worker.stderrBuffer = worker.stderrBuffer.slice(-MAX_STDERR_LENGTH)
  }
}

function stopWorker(worker, reason = '') {
  if (!worker || worker.stopping) {
    return
  }

  worker.stopping = true
  removeWorker(worker)
  updateWorkerExitMetrics({
    signal: 'manual_stop',
    reason,
  })

  if (worker.child?.exitCode === null && !worker.child?.killed) {
    worker.child.kill()
  }
}

function dispatchQueuedRequests() {
  while (requestQueue.length) {
    let worker = workerPool.find((item) => !item.activeRequestId && !item.stopping) || null
    if (!worker && workerPool.length < DEFAULT_MAX_WORKERS) {
      worker = ensureGitDiffWorker()
    }
    if (!worker) {
      return
    }

    const request = requestQueue.shift()
    if (!request || request.settled) {
      continue
    }

    request.workerId = worker.id
    worker.activeRequestId = request.requestId
    activeRequests.set(request.requestId, request)

    try {
      worker.child.stdin?.write(`${JSON.stringify({
        requestId: request.requestId,
        action: 'getTaskGitDiffReview',
        taskSlug: request.taskSlug,
        options: request.options,
      })}\n`)
    } catch (error) {
      worker.activeRequestId = ''
      activeRequests.delete(request.requestId)
      request.workerId = ''
      rejectRequestWithError(request, createWorkerError(String(error?.message || error)))
      stopWorker(worker, String(error?.message || error || 'worker write failed'))
    }
  }
}

function settleWorkerRequest(worker, requestId, handler) {
  const request = activeRequests.get(requestId)
  if (!request) {
    return
  }

  if (worker.activeRequestId === requestId) {
    worker.activeRequestId = ''
  }
  request.workerId = ''
  handler(request)
  dispatchQueuedRequests()
}

function handleWorkerLine(worker, line) {
  let payload
  try {
    payload = JSON.parse(line)
  } catch {
    const error = createWorkerError(`git diff worker returned invalid JSON: ${line.slice(0, 200)}`)
    if (worker.activeRequestId) {
      settleWorkerRequest(worker, worker.activeRequestId, (request) => {
        rejectRequestWithError(request, error)
      })
    }
    stopWorker(worker, error.message)
    return
  }

  const requestId = String(payload?.requestId || '').trim()
  if (!requestId) {
    const error = createWorkerError(
      String(payload?.error?.message || '').trim() || 'git diff worker returned a response without requestId.'
    )
    if (worker.activeRequestId) {
      settleWorkerRequest(worker, worker.activeRequestId, (request) => {
        rejectRequestWithError(request, error)
      })
    }
    stopWorker(worker, error.message)
    return
  }

  settleWorkerRequest(worker, requestId, (request) => {
    if (!payload?.ok) {
      const error = createWorkerError(String(payload?.error?.message || '').trim() || worker.stderrBuffer.trim())
      rejectRequestWithError(request, error)
      return
    }
    resolveRequest(request, payload.result)
  })
}

function handleWorkerStdout(worker, chunk) {
  worker.stdoutBuffer = `${worker.stdoutBuffer}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')}`

  let newlineIndex = worker.stdoutBuffer.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = worker.stdoutBuffer.slice(0, newlineIndex).trim()
    worker.stdoutBuffer = worker.stdoutBuffer.slice(newlineIndex + 1)
    if (line) {
      handleWorkerLine(worker, line)
    }
    newlineIndex = worker.stdoutBuffer.indexOf('\n')
  }
}

function handleWorkerFailure(worker, error) {
  removeWorker(worker)
  updateWorkerExitMetrics({
    reason: String(error?.message || error || 'worker error'),
  })

  if (worker.activeRequestId) {
    settleWorkerRequest(worker, worker.activeRequestId, (request) => {
      rejectRequestWithError(request, createWorkerError(String(error?.message || error)))
    })
  }

  dispatchQueuedRequests()
}

function handleWorkerClose(worker, code, signal) {
  removeWorker(worker)
  updateWorkerExitMetrics({
    code,
    signal,
    reason: worker.stderrBuffer.trim() || (signal ? `signal:${signal}` : `code:${code}`),
  })

  if (worker.activeRequestId) {
    const error = worker.stderrBuffer.trim()
      ? createWorkerError(`git diff worker exited unexpectedly: ${worker.stderrBuffer.trim()}`)
      : createWorkerError('git diff worker exited unexpectedly.')
    settleWorkerRequest(worker, worker.activeRequestId, (request) => {
      rejectRequestWithError(request, error)
    })
  }

  dispatchQueuedRequests()
}

function ensureGitDiffWorker() {
  const child = spawn(process.execPath, [workerEntryPath], {
    cwd: currentDir,
    env: {
      ...process.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  if (workerMetrics.spawnCount > 0) {
    workerMetrics.restartCount += 1
  }

  const worker = createWorkerState(child)
  workerPool.push(worker)
  workerMetrics.spawnCount += 1
  workerMetrics.lastWorkerSpawnedAt = worker.startedAt

  child.stdout?.on('data', (chunk) => {
    handleWorkerStdout(worker, chunk)
  })
  child.stderr?.on('data', (chunk) => {
    appendWorkerStderr(worker, chunk)
  })
  child.on('error', (error) => {
    handleWorkerFailure(worker, error)
  })
  child.on('close', (code, signal) => {
    handleWorkerClose(worker, code, signal)
  })

  return worker
}

export function stopGitDiffWorker() {
  const stopError = createWorkerError('git diff worker stopped.')

  requestQueue.splice(0, requestQueue.length).forEach((request) => {
    rejectRequestWithError(request, stopError)
  })

  for (const request of [...activeRequests.values()]) {
    rejectRequestWithError(request, stopError)
  }

  ;[...workerPool].forEach((worker) => {
    stopWorker(worker, 'stopped')
  })
}

export function getTaskGitDiffReviewInSubprocess(taskSlug = '', options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS)
  const requestId = String(nextRequestId++)
  const requestMeta = {
    requestId,
    taskSlug: String(taskSlug || '').trim(),
    scope: String(options.scope || '').trim(),
    filePath: String(options.filePath || '').trim(),
    startedAt: getNowIso(),
  }

  workerMetrics.totalRequests += 1

  return new Promise((resolve, reject) => {
    const request = {
      requestId,
      taskSlug: String(taskSlug || '').trim(),
      options,
      resolve,
      reject,
      requestMeta,
      settled: false,
      workerId: '',
      timer: setTimeout(() => {
        const currentRequest = requestMap.get(requestId)
        if (!currentRequest || currentRequest.settled) {
          return
        }

        workerMetrics.timeoutRequests += 1
        const timeoutError = createTimeoutError(timeoutMs)
        if (currentRequest.workerId) {
          const worker = getWorkerById(currentRequest.workerId)
          if (worker && worker.activeRequestId === requestId) {
            worker.activeRequestId = ''
          }
          rejectRequestWithError(currentRequest, timeoutError)
          if (worker) {
            stopWorker(worker, `request_timeout:${requestId}`)
          }
          dispatchQueuedRequests()
          return
        }

        rejectRequestWithError(currentRequest, timeoutError)
      }, timeoutMs),
    }

    request.timer.unref?.()
    requestMap.set(requestId, request)
    requestQueue.push(request)
    dispatchQueuedRequests()
  })
}

export function __getGitDiffWorkerPidForTest() {
  return Number(workerPool[0]?.child?.pid || 0)
}

export function __getGitDiffWorkerPidsForTest() {
  return workerPool.map((worker) => Number(worker.child?.pid || 0)).filter((pid) => pid > 0)
}

export function getGitDiffWorkerDiagnostics() {
  return {
    worker: {
      pid: Number(workerPool[0]?.child?.pid || 0),
      running: workerPool.some((worker) => !worker.stopping && worker.child?.exitCode === null && !worker.child?.killed),
      pendingRequests: requestQueue.length + activeRequests.size,
      stderrTail: String(workerPool[0]?.stderrBuffer || '').trim(),
    },
    workers: workerPool.map((worker) => ({
      id: worker.id,
      pid: Number(worker.child?.pid || 0),
      running: !worker.stopping && worker.child?.exitCode === null && !worker.child?.killed,
      activeRequestId: String(worker.activeRequestId || '').trim(),
      stderrTail: String(worker.stderrBuffer || '').trim(),
      startedAt: worker.startedAt,
    })),
    metrics: {
      ...workerMetrics,
      maxWorkers: DEFAULT_MAX_WORKERS,
      queueDepth: requestQueue.length,
      activeRequestCount: activeRequests.size,
      workerCount: workerPool.length,
      lastWorkerExitSignal: String(workerMetrics.lastWorkerExitSignal || ''),
      lastWorkerExitReason: String(workerMetrics.lastWorkerExitReason || ''),
      lastRequest: workerMetrics.lastRequest ? { ...workerMetrics.lastRequest } : null,
    },
  }
}

process.once('exit', () => {
  stopGitDiffWorker()
})
