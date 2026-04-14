import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import {
  createTranscriptFixture,
  openWorkbenchTask,
  shutdownPromptxE2EStack,
  updateTaskViaApi,
} from './helpers.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const E2E_WORKSPACE_ROOT = path.join(REPO_ROOT, 'e2e-fixtures')
const E2E_BASE_URL = String(process.env.PROMPTX_E2E_BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '')

function getCommandShortcut(key) {
  return process.platform === 'darwin' ? `Meta+${key}` : `Control+${key}`
}

function getCommandShiftShortcut(key) {
  return process.platform === 'darwin' ? `Meta+Shift+${key}` : `Control+Shift+${key}`
}

function runGit(cwd, args = []) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
  })
}

async function createGitWorkspaceFixture() {
  const id = randomUUID().slice(0, 8)
  const workspaceDir = path.join(E2E_WORKSPACE_ROOT, `e2e-code-selection-${id}`)

  await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(workspaceDir, 'src', 'source-preview-target.ts'),
    [
      'export function add(left, right) {',
      '  return left + right',
      '}',
      '',
    ].join('\n'),
    'utf8'
  )
  await fs.writeFile(
    path.join(workspaceDir, 'src', 'diff-target.js'),
    [
      'const answer = 41',
      "const label = 'old'",
      'console.log(label)',
      '',
    ].join('\n'),
    'utf8'
  )

  runGit(workspaceDir, ['init'])
  runGit(workspaceDir, ['config', 'user.name', 'PromptX E2E'])
  runGit(workspaceDir, ['config', 'user.email', 'e2e@promptx.dev'])
  runGit(workspaceDir, ['add', '.'])
  runGit(workspaceDir, ['commit', '-m', 'init'])

  await fs.writeFile(
    path.join(workspaceDir, 'src', 'diff-target.js'),
    [
      'const answer = 42',
      "const label = 'new'",
      'console.log(label)',
      'console.log(answer)',
      '',
    ].join('\n'),
    'utf8'
  )

  return {
    workspaceDir,
    async cleanup() {
      await fs.rm(workspaceDir, { recursive: true, force: true })
    },
  }
}

async function selectTextAcross(page, { startSelector, endSelector }) {
  await page.evaluate(({ startSelector: start, endSelector: end }) => {
    function resolveTextNode(element, mode = 'start') {
      if (!element) {
        return null
      }

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return String(node.textContent || '').length
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP
        },
      })

      let current = walker.nextNode()
      if (!current) {
        return element
      }

      if (mode === 'start') {
        return current
      }

      let last = current
      while (current) {
        last = current
        current = walker.nextNode()
      }
      return last
    }

    const startElement = document.querySelector(start)
    const endElement = document.querySelector(end)
    if (!startElement || !endElement) {
      return false
    }

    const startNode = resolveTextNode(startElement, 'start')
    const endNode = resolveTextNode(endElement, 'end')
    if (!startNode || !endNode) {
      return false
    }

    const range = document.createRange()
    range.setStart(startNode, 0)
    range.setEnd(endNode, String(endNode.textContent || '').length)

    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    return true
  }, {
    startSelector,
    endSelector,
  })
}

test('源码选择插入、diff 复制与插入都走真实浏览器链路', async (t) => {
  const workspace = await createGitWorkspaceFixture()
  const fixture = await createTranscriptFixture({
    cwd: workspace.workspaceDir,
    taskTitle: `E2E code selection ${randomUUID().slice(0, 6)}`,
    status: 'completed',
    responseMessage: [
      '这是用于插入编辑区的回复示例。',
      '',
      '- 第一条',
      '- 第二条',
    ].join('\n'),
  })

  t.after(async () => {
    fixture.cleanup()
    await workspace.cleanup()
    await shutdownPromptxE2EStack()
  })

  await updateTaskViaApi(fixture.task.slug, {
    codexSessionId: fixture.session.id,
  })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(E2E_BASE_URL).origin,
  })
  const page = await context.newPage()

  t.after(async () => {
    await context.close()
    await browser.close()
  })

  await openWorkbenchTask(page, fixture.task.slug)

  await page.getByText('这是用于插入编辑区的回复示例。').waitFor({ timeout: 10000 })

  await selectTextAcross(page, {
    startSelector: '.transcript-card--response .codex-markdown p:first-of-type',
    endSelector: '.transcript-card--response .codex-markdown li:last-of-type',
  })

  const responseInsertButton = page.getByRole('button', { name: '插入到编辑区' })
  await responseInsertButton.waitFor({ timeout: 10000 })
  await responseInsertButton.click()
  await page.getByText('已插入到右侧编辑区').waitFor({ timeout: 10000 })

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-promptx-node="text"] [data-promptx-node-content="text"]'))
      .some((element) => String(element.textContent || '').includes('这是用于插入编辑区的回复示例。'))
  )
  const editorTextBlocks = await page.evaluate(() => Array.from(
    document.querySelectorAll('[data-promptx-node="text"] [data-promptx-node-content="text"]')
  ).map((element) => String(element.textContent || '')))
  const insertedResponseText = editorTextBlocks.find((value) => value.includes('这是用于插入编辑区的回复示例。')) || ''
  assert.match(insertedResponseText, /这是用于插入编辑区的回复示例。/)
  assert.match(insertedResponseText, /第一条/)
  assert.match(insertedResponseText, /第二条/)

  await page.keyboard.press(getCommandShiftShortcut('O'))
  const sourceSearchInput = page.getByPlaceholder('搜索文件名或路径片段')
  await sourceSearchInput.waitFor({ timeout: 10000 })
  await sourceSearchInput.fill('source-preview-target')
  await page.getByText('source-preview-target.ts').first().waitFor({ timeout: 10000 })
  await page.getByText('return left + right').first().waitFor({ timeout: 10000 })

  await selectTextAcross(page, {
    startSelector: '.source-code-view__line[data-line="1"] .source-code-view__line-inner',
    endSelector: '.source-code-view__line[data-line="2"] .source-code-view__line-inner',
  })

  const insertButton = page.getByRole('button', { name: '插入到编辑区' })
  await insertButton.waitFor({ timeout: 10000 })
  await page.keyboard.press(getCommandShortcut('C'))

  const copiedSourceText = await page.evaluate(() => navigator.clipboard.readText())
  assert.match(copiedSourceText, /export function add\(left, right\)/)
  assert.match(copiedSourceText, /return left \+ right/)

  await insertButton.click()
  await page.getByText('已插入到右侧编辑区').waitFor({ timeout: 10000 })
  await sourceSearchInput.waitFor({ state: 'hidden', timeout: 10000 })

  const insertedSourceBlock = page.locator('[data-promptx-node="imported_text"]').last()
  await insertedSourceBlock.waitFor({ timeout: 10000 })
  const insertedSourceText = await insertedSourceBlock.textContent()
  assert.match(insertedSourceText || '', /source-preview-target\.ts/)
  assert.match(insertedSourceText || '', /return left \+ right/)

  await page.keyboard.press(getCommandShiftShortcut('D'))
  await page.getByText('src/diff-target.js').first().waitFor({ timeout: 10000 })
  await page.getByText('const answer = 42').first().waitFor({ timeout: 10000 })

  await selectTextAcross(page, {
    startSelector: '.task-diff-row[data-line-kind="delete"] .task-diff-line',
    endSelector: '.task-diff-row[data-line-kind="add"] .task-diff-line',
  })

  const diffInsertButton = page.getByRole('button', { name: '插入到编辑区' })
  await diffInsertButton.waitFor({ timeout: 10000 })
  await page.keyboard.press(getCommandShortcut('C'))

  const copiedDiffText = await page.evaluate(() => navigator.clipboard.readText())
  assert.match(copiedDiffText, /-const answer = 41/)
  assert.match(copiedDiffText, /\+const answer = 42/)

  await diffInsertButton.click()
  await page.getByText('已插入到右侧编辑区').waitFor({ timeout: 10000 })
  await page.getByText('src/diff-target.js').first().waitFor({ state: 'hidden', timeout: 10000 })

  const insertedDiffBlock = page.locator('[data-promptx-node="imported_text"]').last()
  await insertedDiffBlock.waitFor({ timeout: 10000 })
  const insertedDiffText = await insertedDiffBlock.textContent()
  assert.match(insertedDiffText || '', /diff-target\.js/)
  assert.match(insertedDiffText || '', /-const answer = 41/)
  assert.match(insertedDiffText || '', /\+const answer = 42/)
})
