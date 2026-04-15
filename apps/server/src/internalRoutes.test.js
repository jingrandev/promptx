import assert from 'node:assert/strict'
import Fastify from 'fastify'
import test from 'node:test'

import { buildInternalAuthHeaders } from './internalAuth.js'
import {
  registerInternalRunnerRoutes,
  registerRealtimeRoutes,
} from './internalRoutes.js'

test('internal runner routes require auth and notify completed runs', async () => {
  const events = []
  const notified = []
  const app = Fastify()

  registerInternalRunnerRoutes(app, {
    runEventIngestService: {
      ingestEvents(items) {
        events.push(...items)
        return { ok: true, count: items.length }
      },
      ingestStatus(payload) {
        return {
          ...payload,
          id: payload.runId,
          completed: true,
        }
      },
    },
    taskAutomationService: {
      notifyRun(taskSlug, runId) {
        notified.push({ taskSlug, runId })
        return Promise.resolve()
      },
    },
  })
  await app.ready()

  try {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/internal/runner-events',
      payload: { items: [] },
    })
    assert.equal(unauthorized.statusCode, 401)

    const eventsResponse = await app.inject({
      method: 'POST',
      url: '/internal/runner-events',
      headers: buildInternalAuthHeaders(),
      payload: {
        items: [{ runId: 'run-1', type: 'stdout' }],
      },
    })
    assert.equal(eventsResponse.statusCode, 200)
    assert.equal(events.length, 1)

    const statusResponse = await app.inject({
      method: 'POST',
      url: '/internal/runner-status',
      headers: buildInternalAuthHeaders(),
      payload: {
        runId: 'run-1',
        taskSlug: 'task-1',
        status: 'completed',
      },
    })
    assert.equal(statusResponse.statusCode, 200)
    assert.deepEqual(notified, [{ taskSlug: 'task-1', runId: 'run-1' }])
  } finally {
    await app.close()
  }
})

test('internal runner events route accepts payloads larger than default body limit', async () => {
  const app = Fastify()
  let acceptedCount = 0

  registerInternalRunnerRoutes(app, {
    runEventIngestService: {
      ingestEvents(items) {
        acceptedCount = items.length
        return { ok: true, count: items.length }
      },
      ingestStatus() {
        return null
      },
    },
    taskAutomationService: {
      notifyRun() {
        return Promise.resolve()
      },
    },
  })
  await app.ready()

  try {
    const largeText = 'x'.repeat(2 * 1024 * 1024)
    const response = await app.inject({
      method: 'POST',
      url: '/internal/runner-events',
      headers: buildInternalAuthHeaders(),
      payload: {
        items: [{ runId: 'run-large', seq: 1, type: 'stdout', payload: { text: largeText } }],
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(acceptedCount, 1)
  } finally {
    await app.close()
  }
})

test('realtime routes are registered on the app', async () => {
  const app = Fastify()

  registerRealtimeRoutes(app, {
    sseHub: {
      addClient() {
        return () => {}
      },
      write() {},
    },
  })
  await app.ready()

  try {
    const routes = app.printRoutes()
    assert.match(routes, /api\/events\/stream/)
  } finally {
    await app.close()
  }
})
