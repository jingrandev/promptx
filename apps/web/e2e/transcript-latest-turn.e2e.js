import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'

import {
  appendRunPayloads,
  buildAgentMessageEvent,
  buildCommandCompletedEvent,
  buildCommandStartedEvent,
  buildReasoningEvent,
  buildSessionPayload,
  buildThreadStartedEvent,
  buildTurnCompletedEvent,
  buildTurnStartedEvent,
  createTranscriptFixture,
  openWorkbenchTask,
  shutdownPromptxE2EStack,
} from './helpers.js'

test('最新一条 turn 默认展开并展示完整执行过程', async (t) => {
  const fixture = await createTranscriptFixture({
    taskTitle: 'E2E latest turn',
    prompt: '请把最新一条 turn 默认展开',
    responseMessage: '好的，最新一条 turn 已默认展开。',
    status: 'completed',
  })

  t.after(async () => {
    fixture.cleanup()
    await shutdownPromptxE2EStack()
  })

  const threadId = 'thread-e2e-latest'
  await appendRunPayloads(fixture.run.id, [
    buildSessionPayload(fixture.session, {
      codexThreadId: threadId,
      engineThreadId: threadId,
    }),
    buildThreadStartedEvent(threadId),
    buildTurnStartedEvent(),
    buildReasoningEvent('先检查最后一条 turn 的默认展开状态'),
    buildCommandStartedEvent('pnpm build'),
    buildCommandCompletedEvent('pnpm build', 'Build completed'),
    buildAgentMessageEvent('好的，最新一条 turn 已默认展开。'),
    buildTurnCompletedEvent({
      input_tokens: 120,
      cached_input_tokens: 48,
      output_tokens: 36,
    }),
  ])

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })

  try {
    await openWorkbenchTask(page, fixture.task.slug)

    const transcript = page.locator('[data-promptx-transcript="1"]')
    const lastTurn = transcript.locator('[data-promptx-turn="1"]').filter({ hasText: '请把最新一条 turn 默认展开' }).first()
    const processCard = lastTurn.locator('.transcript-card--process').first()
    const processToggle = processCard.getByRole('button', { name: /展开|收起/ }).first()
    const processLogs = processCard.locator('.transcript-event-card')
    const responseCard = lastTurn.locator('.transcript-card--response .codex-markdown').first()

    await assert.doesNotReject(() => lastTurn.getByText('请把最新一条 turn 默认展开').waitFor())
    await assert.doesNotReject(() => processCard.getByText('开始执行命令').waitFor())
    await assert.doesNotReject(() => processCard.getByText('pnpm build').first().waitFor())
    await assert.doesNotReject(() => processCard.getByText('命令执行完成').waitFor())
    await assert.doesNotReject(() => responseCard.getByText('好的，最新一条 turn 已默认展开。').waitFor())
    assert.equal((await processToggle.textContent())?.trim(), '收起')
    assert.equal(await processCard.getByText(/展开后加载/).count(), 0)
    assert.equal(await processCard.getByText('已折叠').count(), 0)
    assert.ok((await processLogs.count()) >= 4)
  } finally {
    await browser.close()
  }
})
