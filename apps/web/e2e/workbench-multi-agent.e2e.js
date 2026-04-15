import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { BLOCK_TYPES } from '@promptx/shared'
import { createTask, deleteTask } from '../../server/src/repository.js'
import { createPromptxCodexSession, deletePromptxCodexSession } from '../../server/src/codexSessions.js'
import {
  ensurePromptxE2EStack,
  focusTiptapBlock,
  shutdownPromptxE2EStack,
  updateTaskViaApi,
} from './helpers.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const E2E_WORKSPACE_ROOT = path.join(REPO_ROOT, 'e2e-fixtures')

async function createWorkspaceFixture() {
  const id = randomUUID().slice(0, 8)
  const workspaceDir = path.join(E2E_WORKSPACE_ROOT, `e2e-workbench-multi-agent-${id}`)

  await fs.mkdir(workspaceDir, { recursive: true })
  await fs.writeFile(
    path.join(workspaceDir, 'README.md'),
    `# multi agent smoke ${id}\n`,
    'utf8'
  )

  return {
    workspaceDir,
    async cleanup() {
      await fs.rm(workspaceDir, { recursive: true, force: true })
    },
  }
}

async function openWorkbenchTask(page, taskSlug, baseUrl) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('promptx:locale', 'zh-CN')
    } catch {
    }
  })

  await page.goto(`${String(baseUrl).replace(/\/$/, '')}/?task=${encodeURIComponent(taskSlug)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await page.waitForTimeout(500)
  const inputTab = page.getByRole('button', { name: '输入' })
  if (await inputTab.count()) {
    await inputTab.first().click()
  }
  await page.locator('.ProseMirror').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
}

async function refillEditorText(page, value) {
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(100)

  try {
    await focusTiptapBlock(page, { index: 0, position: 'end' })
  } catch {
    await page.locator('.ProseMirror').first().click()
  }

  await page.keyboard.insertText(String(value || ''))
  await page.waitForTimeout(180)
}

function buildInterceptRunResponse({ taskSlug, projectSession, targetSessionId, engine, prompt, promptBlocks }) {
  const now = new Date().toISOString()
  return {
    run: {
      id: `run_${randomUUID().slice(0, 10)}`,
      taskSlug,
      sessionId: targetSessionId,
      engine,
      status: 'completed',
      prompt,
      promptBlocks,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      finishedAt: now,
      responseMessage: '',
      errorMessage: '',
      events: [],
      eventsIncluded: true,
      eventCount: 0,
    },
    session: {
      ...projectSession,
      running: false,
      updatedAt: now,
    },
  }
}

test('多 agent 项目可在右侧切换发送目标，并兼容移动端布局', async (t) => {
  const workspace = await createWorkspaceFixture()
  const task = createTask({
    title: `E2E Multi Agent ${randomUUID().slice(0, 6)}`,
    blocks: [{
      type: BLOCK_TYPES.TEXT,
      content: '@claude 冒烟链路保留这个前缀',
    }],
  })
  const projectSession = createPromptxCodexSession({
    title: `E2E Multi Agent Project ${randomUUID().slice(0, 6)}`,
    engine: 'codex',
    agentEngines: ['codex', 'claude-code', 'opencode'],
    cwd: workspace.workspaceDir,
  })

  t.after(async () => {
    deleteTask(task.slug)
    deletePromptxCodexSession(projectSession.id)
    await workspace.cleanup()
    await shutdownPromptxE2EStack()
  })

  const stack = await ensurePromptxE2EStack()
  const baseUrl = 'http://127.0.0.1:5174'

  await updateTaskViaApi(task.slug, {
    codexSessionId: projectSession.id,
    blocks: [{
      type: BLOCK_TYPES.TEXT,
      content: '@claude 冒烟链路保留这个前缀',
    }],
  })

  const browser = await chromium.launch({ headless: true })
  t.after(async () => {
    await browser.close()
  })

  const captures = []
  const expectedBindings = Array.isArray(projectSession.agentBindings) ? projectSession.agentBindings : []
  const bindingByEngine = new Map(expectedBindings.map((item) => [item.engine, item]))

  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await desktopPage.route(`**/api/tasks/${task.slug}/codex-runs`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    const payload = route.request().postDataJSON()
    captures.push(payload)
    const targetBinding = expectedBindings.find((item) => item.sessionRecordId === payload.sessionId)
    const response = buildInterceptRunResponse({
      taskSlug: task.slug,
      projectSession,
      targetSessionId: payload.sessionId,
      engine: targetBinding?.engine || 'codex',
      prompt: payload.prompt,
      promptBlocks: payload.promptBlocks,
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })

  await openWorkbenchTask(desktopPage, task.slug, baseUrl)

  const agentTargets = desktopPage.locator('[data-promptx-agent-targets]')
  await agentTargets.waitFor({ timeout: 10000 })
  const optionTexts = await agentTargets.locator('button').allTextContents()
  assert.equal(optionTexts.length, 3)
  assert.match(optionTexts[0], /Codex/i)
  assert.match(optionTexts[1], /Claude/i)
  assert.match(optionTexts[2], /OpenCode/i)

  const sendButton = desktopPage.getByRole('button', { name: '发送' })
  await sendButton.click()
  await desktopPage.waitForTimeout(250)

  await refillEditorText(desktopPage, '@claude 冒烟链路保留这个前缀')
  await agentTargets.locator('[data-agent-engine="claude-code"]').click()
  await desktopPage.waitForTimeout(120)
  await sendButton.click()
  await desktopPage.waitForTimeout(250)

  await refillEditorText(desktopPage, '@claude 冒烟链路保留这个前缀')
  await agentTargets.locator('[data-agent-engine="opencode"]').click()
  await desktopPage.waitForTimeout(120)
  await sendButton.click()
  await desktopPage.waitForTimeout(250)

  assert.equal(captures.length, 3)
  assert.deepEqual(captures.map((item) => item.projectSessionId), [
    projectSession.id,
    projectSession.id,
    projectSession.id,
  ])
  assert.deepEqual(captures.map((item) => item.sessionId), [
    bindingByEngine.get('codex')?.sessionRecordId,
    bindingByEngine.get('claude-code')?.sessionRecordId,
    bindingByEngine.get('opencode')?.sessionRecordId,
  ])
  captures.forEach((item) => {
    assert.match(String(item.prompt || ''), /@claude 冒烟链路保留这个前缀/)
  })

  const agentFilter = desktopPage.getByLabel('Agent 过滤')
  const allFilterButton = agentFilter.getByRole('button', { name: '全部' })
  await allFilterButton.waitFor({ timeout: 10000 })
  await agentFilter.getByRole('button', { name: 'Claude Code' }).click()
  await desktopPage.waitForTimeout(250)
  const filteredState = await desktopPage.evaluate(() => ({
    promptCards: document.querySelectorAll('.transcript-card--prompt').length,
    processCards: document.querySelectorAll('.transcript-card--process').length,
    responseCards: document.querySelectorAll('.transcript-card--response').length,
    responseText: document.querySelector('.transcript-card--response')?.textContent || '',
  }))
  assert.equal(filteredState.promptCards, 1)
  assert.equal(filteredState.processCards, 1)
  assert.equal(filteredState.responseCards, 1)
  assert.match(filteredState.responseText, /Claude Code：/)
  assert.match(filteredState.responseText, /本轮 Claude Code 执行已完成/)
  await allFilterButton.click()
  await desktopPage.waitForTimeout(250)
  assert.equal(await desktopPage.evaluate(() => document.querySelectorAll('.transcript-card--prompt').length), 3)

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobilePage.addInitScript(() => {
    try {
      window.localStorage.setItem('promptx:locale', 'zh-CN')
    } catch {
    }
  })
  await mobilePage.goto(`${String(baseUrl).replace(/\/$/, '')}/?task=${encodeURIComponent(task.slug)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await mobilePage.waitForTimeout(1200)
  await mobilePage.getByText(task.title).first().click()
  await mobilePage.waitForTimeout(400)

  const mobileActivityTab = mobilePage.getByRole('button', { name: '过程' })
  if (await mobileActivityTab.count()) {
    await mobileActivityTab.first().click()
    await mobilePage.getByRole('button', { name: '全部' }).waitFor({ timeout: 10000 })
    await mobilePage.getByRole('button', { name: 'Claude Code' }).waitFor({ timeout: 10000 })
  }

  const mobileInputTab = mobilePage.getByRole('button', { name: '输入' })
  if (await mobileInputTab.count()) {
    await mobileInputTab.first().click()
  }

  const mobileAgentTargets = mobilePage.locator('[data-promptx-agent-targets]')
  await mobileAgentTargets.waitFor({ timeout: 10000 })
  assert.equal(await mobileAgentTargets.isVisible(), true)
  assert.equal(await mobilePage.getByRole('button', { name: '发送' }).isVisible(), true)
  assert.equal(await mobilePage.getByRole('button', { name: '选文件' }).isVisible(), true)

  const mobileBox = await mobileAgentTargets.boundingBox()
  assert.ok(mobileBox && mobileBox.width > 120)

  assert.ok(stack?.apiUrl)
})
