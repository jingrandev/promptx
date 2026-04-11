import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import {
  createTranscriptFixture,
  focusTiptapBlock,
  openWorkbenchTask,
  readTiptapBlockText,
  shutdownPromptxE2EStack,
  updateTaskViaApi,
} from './helpers.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const E2E_WORKSPACE_ROOT = path.join(REPO_ROOT, 'e2e-fixtures')

function getCommandShortcut(key) {
  return process.platform === 'darwin' ? `Meta+${key}` : `Control+${key}`
}

function getCommandShiftShortcut(key) {
  return process.platform === 'darwin' ? `Meta+Shift+${key}` : `Control+Shift+${key}`
}

async function createWorkspaceFixture() {
  const id = randomUUID().slice(0, 8)
  const workspaceDir = path.join(E2E_WORKSPACE_ROOT, `e2e-workbench-pickers-${id}`)
  const dirSearchName = `picker-dir-${id}`
  const sourceNeedle = `SOURCE_BROWSER_NEEDLE_${id}`
  const sourcePreviewOnly = `SOURCE_BROWSER_PREVIEW_ONLY_${id}`

  await fs.mkdir(E2E_WORKSPACE_ROOT, { recursive: true })
  await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceDir, 'docs'), { recursive: true })
  await fs.mkdir(path.join(workspaceDir, dirSearchName), { recursive: true })

  await fs.writeFile(
    path.join(workspaceDir, 'package.json'),
    JSON.stringify({
      name: `e2e-workbench-pickers-${id}`,
      private: true,
    }, null, 2),
    'utf8'
  )
  await fs.writeFile(
    path.join(workspaceDir, 'src', 'source-preview-target.ts'),
    [
      `export const sourceNeedle = '${sourceNeedle}'`,
      `export const sourcePreviewOnly = '${sourcePreviewOnly}'`,
      'export function sum(left, right) {',
      '  return left + right',
      '}',
      '',
    ].join('\n'),
    'utf8'
  )
  await fs.writeFile(
    path.join(workspaceDir, dirSearchName, 'README.md'),
    '# Directory Picker Target\n',
    'utf8'
  )

  return {
    dirSearchName,
    sourceNeedle,
    sourcePreviewOnly,
    workspaceDir,
    async cleanup() {
      await fs.rm(workspaceDir, { recursive: true, force: true })
    },
  }
}

async function expectFocused(locator) {
  const focused = await locator.evaluate((element) => element === document.activeElement)
  assert.equal(focused, true)
}

test('工作台关键选择器支持真实浏览器键盘链路', async (t) => {
  const workspace = await createWorkspaceFixture()
  const mentionFixture = await createTranscriptFixture({
    cwd: workspace.workspaceDir,
    taskTitle: `E2E mention picker ${randomUUID().slice(0, 6)}`,
    taskBlocks: [
      {
        type: 'text',
        content: '请参考 ',
      },
    ],
  })
  const sourceFixture = await createTranscriptFixture({
    cwd: workspace.workspaceDir,
    taskTitle: `E2E source browser ${randomUUID().slice(0, 6)}`,
  })
  const directoryFixture = await createTranscriptFixture({
    cwd: workspace.workspaceDir,
    taskTitle: `E2E directory picker ${randomUUID().slice(0, 6)}`,
  })

  t.after(async () => {
    mentionFixture.cleanup()
    sourceFixture.cleanup()
    directoryFixture.cleanup()
    await workspace.cleanup()
    await shutdownPromptxE2EStack()
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

  t.after(async () => {
    await browser.close()
  })

  await updateTaskViaApi(mentionFixture.task.slug, {
    codexSessionId: mentionFixture.session.id,
    blocks: [
      {
        type: 'text',
        content: '请参考 ',
      },
    ],
  })

  await openWorkbenchTask(page, mentionFixture.task.slug)
  await page.locator('.ProseMirror').first().waitFor()
  await focusTiptapBlock(page, { index: 0, position: 'end' })
  await page.keyboard.press(getCommandShortcut('K'))
  await page.keyboard.insertText('package')
  await page.getByText('package.json').first().waitFor({ timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  const mentionText = await readTiptapBlockText(page, { index: 0 })
  assert.match(mentionText, /package\.json/)

  await updateTaskViaApi(sourceFixture.task.slug, {
    codexSessionId: sourceFixture.session.id,
  })

  await openWorkbenchTask(page, sourceFixture.task.slug)
  await page.keyboard.press(getCommandShiftShortcut('O'))

  const sourcePathInput = page.getByPlaceholder('搜索文件名或路径片段')
  await sourcePathInput.waitFor({ timeout: 10000 })
  await expectFocused(sourcePathInput)
  await sourcePathInput.fill('source-preview-target')
  await page.getByText('source-preview-target.ts').first().waitFor({ timeout: 10000 })
  await page.getByText(workspace.sourcePreviewOnly).first().waitFor({ timeout: 10000 })
  await sourcePathInput.fill('')

  await sourcePathInput.press('Tab')
  const sourceContentInput = page.getByPlaceholder('按文件内容搜索')
  await sourceContentInput.waitFor({ timeout: 10000 })
  await expectFocused(sourceContentInput)
  await sourceContentInput.fill(workspace.sourceNeedle)
  const sourceMatch = page.getByText(workspace.sourceNeedle).first()
  await sourceMatch.waitFor({ timeout: 10000 })
  await page.getByText(workspace.sourcePreviewOnly).first().waitFor({ timeout: 10000 })

  await sourceContentInput.press('Tab')
  const sourcePathInputAgain = page.getByPlaceholder('搜索文件名或路径片段')
  await sourcePathInputAgain.waitFor({ timeout: 10000 })
  await expectFocused(sourcePathInputAgain)
  assert.equal(await sourcePathInputAgain.inputValue(), workspace.sourceNeedle)

  await sourcePathInputAgain.press('Escape')
  assert.equal(await sourcePathInputAgain.inputValue(), '')
  assert.equal(await sourcePathInputAgain.count(), 1)

  await sourcePathInputAgain.press('Escape')
  await page.waitForTimeout(300)
  assert.equal(await page.getByPlaceholder('搜索文件名或路径片段').count(), 0)

  await openWorkbenchTask(page, directoryFixture.task.slug)
  await page.getByRole('button', { name: '管理项目' }).click()

  const chooseDirectoryButton = page.getByRole('button', { name: '选择目录' })
  await chooseDirectoryButton.waitFor({ timeout: 10000 })
  await chooseDirectoryButton.click()

  const directorySearchInput = page.getByPlaceholder('输入目录名或路径片段，例如 promptx / code')
  await directorySearchInput.waitFor({ timeout: 10000 })
  await expectFocused(directorySearchInput)

  await directorySearchInput.fill(workspace.dirSearchName)
  await page.getByText(workspace.dirSearchName).first().waitFor({ timeout: 10000 })
  await directorySearchInput.press('Escape')
  assert.equal(await directorySearchInput.inputValue(), '')
  assert.equal(await page.getByText('选择工作目录').count(), 1)

  await directorySearchInput.fill(workspace.dirSearchName)
  await page.getByText(workspace.dirSearchName).first().waitFor({ timeout: 10000 })
  await directorySearchInput.press('Enter')
  await page.waitForTimeout(300)

  assert.equal(await directorySearchInput.inputValue(), '')
  await page.getByText(path.join(workspace.workspaceDir, workspace.dirSearchName)).first().waitFor({ timeout: 10000 })

  await page.keyboard.press('Escape')
  await page.getByPlaceholder('输入目录名或路径片段，例如 promptx / code').waitFor({ state: 'hidden', timeout: 10000 })
})
