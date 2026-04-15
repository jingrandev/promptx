import assert from 'node:assert/strict'
import test from 'node:test'

import { shellRunner } from './shellRunner.js'

function collectShellEvents(command) {
  const events = []
  const stream = shellRunner.streamSessionPrompt({
    id: 'session-shell-test',
    cwd: process.cwd(),
  }, command, {
    onEvent(event) {
      events.push(event)
    },
  })

  return {
    events,
    stream,
  }
}

test('shellRunner runs a one-shot shell command and emits command events', async () => {
  const command = `"${process.execPath}" -e "console.log('hello shell')"`
  const { events, stream } = collectShellEvents(command)
  const result = await stream.result

  assert.match(result.message, /hello shell/)
  assert.ok(events.some((event) => event?.event?.type === 'item.started'))
  assert.ok(events.some((event) => event?.event?.type === 'item.completed'))
  assert.ok(events.some((event) => event?.type === 'stdout' && /hello shell/.test(event.text || '')))
})

test('shellRunner surfaces non-zero exit output on errors', async () => {
  const command = `"${process.execPath}" -e "console.error('shell failed'); process.exit(3)"`
  const { events, stream } = collectShellEvents(command)

  await assert.rejects(
    stream.result,
    (error) => /exit 3/.test(String(error?.message || '')) && /shell failed/.test(String(error?.output || ''))
  )

  const completed = events.find((event) => event?.event?.type === 'item.completed')
  assert.equal(completed?.event?.item?.exit_code, 3)
  assert.equal(completed?.event?.item?.status, 'failed')
})
