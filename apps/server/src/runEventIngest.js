import { normalizeAgentRunEnvelopeEventType } from '../../../packages/shared/src/index.js'
import {
  appendCodexRunEventsBatch,
  getCodexRunById,
  isTerminalRunStatus,
  updateCodexRunFromRunnerStatus,
} from './codexRuns.js'
import { getPromptxCodexSessionById, updatePromptxCodexSession } from './codexSessions.js'

function toSafeSessionPatch(session = {}) {
  const hasIdentityPatch = [
    'codexThreadId',
    'engineSessionId',
    'engineThreadId',
  ].some((key) => Object.prototype.hasOwnProperty.call(session, key))

  return {
    ...(Object.prototype.hasOwnProperty.call(session, 'title')
      ? { title: session.title }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(session, 'codexThreadId')
      ? { codexThreadId: session.codexThreadId }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(session, 'engineSessionId')
      ? { engineSessionId: session.engineSessionId }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(session, 'engineThreadId')
      ? { engineThreadId: session.engineThreadId }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(session, 'engineMeta')
      ? { engineMeta: session.engineMeta }
      : {}),
    ...(hasIdentityPatch
      ? { clearManualSessionBinding: true }
      : {}),
    updatedAt: session.updatedAt || new Date().toISOString(),
  }
}

function syncSessionFromEnvelope(session = null) {
  const sessionId = String(session?.id || '').trim()
  if (!sessionId) {
    return null
  }

  try {
    return updatePromptxCodexSession(sessionId, toSafeSessionPatch(session))
  } catch {
    return null
  }
}

export function createRunEventIngestService(options = {}) {
  const broadcastServerEvent = options.broadcastServerEvent || (() => {})
  const resolveSessionSnapshot = options.resolveSessionSnapshot
    || ((sessionId = '') => getPromptxCodexSessionById(sessionId))
  const decorateCodexSession = options.decorateCodexSession || ((session) => session)

  function hydrateEnvelopeSession(session = null) {
    const sessionId = String(session?.id || '').trim()
    if (!sessionId) {
      return null
    }

    syncSessionFromEnvelope(session)

    const storedSession = resolveSessionSnapshot(sessionId)
    if (storedSession?.id) {
      return decorateCodexSession(storedSession)
    }

    return null
  }

  function normalizeEnvelopeItem(item = {}) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : null
    const envelopeType = normalizeAgentRunEnvelopeEventType(payload?.type)
    if (envelopeType !== 'session' && envelopeType !== 'session.updated') {
      return item
    }

    const nextSession = hydrateEnvelopeSession(payload?.session || null)
    if (!nextSession) {
      return item
    }

    return {
      ...item,
      payload: {
        ...payload,
        session: nextSession,
      },
    }
  }

  function notifyRunUpdated(runRecord) {
    if (!runRecord?.id) {
      return
    }

    broadcastServerEvent('runs.changed', {
      taskSlug: runRecord.taskSlug,
      runId: runRecord.id,
      status: runRecord.status,
    })

    if (runRecord.sessionId) {
      broadcastServerEvent('sessions.changed', {
        sessionId: runRecord.sessionId,
      })
    }
  }

  return {
    ingestEvents(items = []) {
      const grouped = new Map()

      ;(Array.isArray(items) ? items : []).forEach((item) => {
        const runId = String(item?.runId || '').trim()
        if (!runId) {
          return
        }

        const bucket = grouped.get(runId) || []
        bucket.push(item)
        grouped.set(runId, bucket)
      })

      const results = []

      grouped.forEach((runItems, runId) => {
        const events = appendCodexRunEventsBatch(runId, runItems.map((item) => normalizeEnvelopeItem(item))) || []
        const runRecord = getCodexRunById(runId)
        if (!runRecord) {
          return
        }

        events.forEach((event) => {
          const envelopeType = normalizeAgentRunEnvelopeEventType(event?.payload?.type)
          if (envelopeType === 'session' || envelopeType === 'session.updated') {
            const nextSession = event?.payload?.session || null
            if (nextSession?.id) {
              broadcastServerEvent('sessions.changed', {
                sessionId: nextSession.id,
              })
            }
          }

          broadcastServerEvent('run.event', {
            taskSlug: runRecord.taskSlug,
            runId,
            event,
          })
        })

        results.push({
          runId,
          accepted: events.length,
        })
      })

      return {
        ok: true,
        items: results,
      }
    },
    ingestStatus(payload = {}) {
      const runId = String(payload.runId || '').trim()
      if (!runId) {
        return null
      }

      const previousRun = getCodexRunById(runId)
      if (payload.session && typeof payload.session === 'object') {
        const nextSession = hydrateEnvelopeSession(payload.session)
        if (nextSession?.id) {
          broadcastServerEvent('sessions.changed', {
            sessionId: nextSession.id,
          })
        }
      }

      if (previousRun && isTerminalRunStatus(previousRun.status)) {
        return previousRun
      }

      const updatedRun = updateCodexRunFromRunnerStatus(runId, {
        status: payload.status,
        responseMessage: payload.responseMessage,
        errorMessage: payload.errorMessage,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
        updatedAt: payload.heartbeatAt || new Date().toISOString(),
      })

      if (!updatedRun) {
        return null
      }

      const shouldNotify = !previousRun
        || previousRun.status !== updatedRun.status
        || previousRun.responseMessage !== updatedRun.responseMessage
        || previousRun.errorMessage !== updatedRun.errorMessage
        || previousRun.finishedAt !== updatedRun.finishedAt

      if (shouldNotify) {
        notifyRunUpdated(updatedRun)
      }
      return updatedRun
    },
  }
}
