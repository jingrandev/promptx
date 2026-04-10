import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { ref } from 'vue'

import {
  buildRunFingerprintForTranscript,
  buildTurnVisibleSnapshot,
  codexRunHistoryApi,
  useCodexRunHistory,
} from './useCodexRunHistory.js'

test('隐藏执行过程时，process-only 更新不改变可见快照', () => {
  const previous = {
    id: 'run-1',
    prompt: '你好',
    responseMessage: '',
    errorMessage: '',
    status: 'running',
    updatedAt: '2026-03-28T10:00:00.000Z',
    eventCount: 12,
    lastEventSeq: 12,
  }
  const next = {
    ...previous,
    updatedAt: '2026-03-28T10:00:05.000Z',
    eventCount: 18,
    lastEventSeq: 18,
  }

  assert.deepEqual(
    buildTurnVisibleSnapshot(previous, false),
    buildTurnVisibleSnapshot(next, false)
  )
})

test('显示执行过程时，process-only 更新会改变可见指纹', () => {
  const runs = [
    {
      id: 'run-1',
      prompt: '你好',
      responseMessage: '',
      errorMessage: '',
      status: 'running',
      updatedAt: '2026-03-28T10:00:00.000Z',
      eventCount: 12,
      lastEventSeq: 12,
    },
  ]
  const nextRuns = [
    {
      ...runs[0],
      updatedAt: '2026-03-28T10:00:05.000Z',
      eventCount: 18,
      lastEventSeq: 18,
    },
  ]

  assert.notEqual(
    buildRunFingerprintForTranscript(runs, true),
    buildRunFingerprintForTranscript(nextRuns, true)
  )
  assert.equal(
    buildRunFingerprintForTranscript(runs, false),
    buildRunFingerprintForTranscript(nextRuns, false)
  )
})

test('refreshRunHistory 在切任务 scrollToLatest 时强制滚到底部', async () => {
  const taskSlug = ref('testx-dev')
  const turns = ref([])
  const sessions = ref([])
  const sending = ref(false)
  const sendingStartedAt = ref(0)
  const currentRunningRunId = ref('')
  const sessionError = ref('')
  const showProcessLogs = ref(true)
  const scrollCalls = []

  const listRunsMock = mock.method(codexRunHistoryApi, 'listTaskCodexRuns', async () => ({
    items: [
      {
        id: 'run-1',
        prompt: 'hello',
        responseMessage: 'world',
        status: 'completed',
        createdAt: '2026-04-10T10:00:00.000Z',
      },
    ],
  }))

  try {
    const { refreshRunHistory } = useCodexRunHistory({
      props: {
        active: true,
        taskSlug: taskSlug.value,
      },
      turns,
      sessions,
      sending,
      sendingStartedAt,
      currentRunningRunId,
      sessionError,
      supportsServerEvents: true,
      scheduleScrollToBottom: (options = {}) => {
        scrollCalls.push(options)
      },
      resetAutoStickToBottom: () => {},
      mergeSessionRecord: (_current, next) => next,
      mergeSession: () => {},
      loadSessions: async () => {},
      showProcessLogs,
    })

    await refreshRunHistory({ force: true, scrollToLatest: true })

    assert.equal(scrollCalls.length, 1)
    assert.deepEqual(scrollCalls[0], { force: true })
  } finally {
    listRunsMock.mock.restore()
  }
})
