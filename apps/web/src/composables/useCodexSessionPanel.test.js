import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatCodexEvent,
  restoreTurnsFromStorage,
  sortSessions,
} from './useCodexSessionPanel.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    removeItem(key) {
      data.delete(key)
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
  }
}

test('sortSessions prioritizes running then current then updatedAt', () => {
  const sessions = sortSessions([
    { id: 'old', running: false, updatedAt: '2024-01-01T00:00:00.000Z' },
    { id: 'current', running: false, updatedAt: '2024-01-03T00:00:00.000Z' },
    { id: 'running', running: true, updatedAt: '2024-01-02T00:00:00.000Z' },
  ], 'current')

  assert.deepEqual(sessions.map((item) => item.id), ['running', 'current', 'old'])
})

test('formatCodexEvent formats command completion details', () => {
  const event = formatCodexEvent({
    type: 'item.completed',
    item: {
      type: 'command_execution',
      status: 'completed',
      command: 'pnpm build',
      aggregated_output: 'done',
    },
  })

  assert.equal(event.kind, 'command')
  assert.equal(event.title, '命令执行完成')
  assert.match(event.detail, /pnpm build/)
})

test('restoreTurnsFromStorage prefers indexedDB transcript data', async () => {
  const turns = await restoreTurnsFromStorage('task-a', {
    getStoredTranscript: async () => [{ id: 1, prompt: 'from-db' }],
    setStoredTranscript: async () => {
      throw new Error('should not migrate legacy data')
    },
    storage: createMemoryStorage({
      'task-a': JSON.stringify([{ id: 2, prompt: 'legacy' }]),
    }),
  })

  assert.deepEqual(turns, [{ id: 1, prompt: 'from-db' }])
})

test('restoreTurnsFromStorage migrates legacy localStorage transcript when indexedDB is empty', async () => {
  const storage = createMemoryStorage({
    'task-b': JSON.stringify([{ id: 2, prompt: 'legacy' }]),
  })
  const writes = []

  const turns = await restoreTurnsFromStorage('task-b', {
    getStoredTranscript: async () => null,
    setStoredTranscript: async (key, value) => {
      writes.push({ key, value })
    },
    storage,
  })

  assert.deepEqual(turns, [{ id: 2, prompt: 'legacy' }])
  assert.deepEqual(writes, [{
    key: 'task-b',
    value: [{ id: 2, prompt: 'legacy' }],
  }])
  assert.equal(storage.getItem('task-b'), null)
})
