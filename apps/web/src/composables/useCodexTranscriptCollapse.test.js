import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'

import { useCodexTranscriptCollapse } from './useCodexTranscriptCollapse.js'

test('getTurnEventCount keeps stable total count after events are loaded', () => {
  const turns = ref([])
  const { getTurnEventCount } = useCodexTranscriptCollapse({
    turns,
    loadTurnEvents: async () => {},
  })

  const turn = {
    id: 'turn-1',
    runId: 'run-1',
    status: 'completed',
    eventCount: 13,
    eventsLoaded: true,
    eventsLoading: false,
    events: new Array(6).fill(null).map((_, index) => ({ id: `event-${index}` })),
  }

  assert.equal(getTurnEventCount(turn), 13)
})
