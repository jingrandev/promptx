import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDir, '..')
const outputDir = path.join(workspaceRoot, 'docs', 'assets')
const playwrightModuleUrl = pathToFileURL(
  path.join(workspaceRoot, 'apps', 'web', 'node_modules', 'playwright', 'index.mjs')
).href
const promptxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-readme-'))
const serverPort = '3101'
const runnerPort = '3102'
const webPort = '5184'
const baseUrl = `http://127.0.0.1:${webPort}`
const apiUrl = `http://127.0.0.1:${serverPort}`

process.env.PROMPTX_HOME = promptxHome
process.env.HOST = '127.0.0.1'
process.env.PROMPTX_SERVER_PORT = serverPort
process.env.PROMPTX_RUNNER_PORT = runnerPort
process.env.PROMPTX_WEB_PORT = webPort
process.env.PORT = serverPort
process.env.RUNNER_PORT = runnerPort
process.env.WEB_PORT = webPort
process.env.PROMPTX_E2E_BASE_URL = baseUrl
process.env.PROMPTX_E2E_API_URL = apiUrl

const [
  { chromium },
  helpers,
  repository,
  codexSessions,
  codexRuns,
  shared,
] = await Promise.all([
  import(playwrightModuleUrl),
  import('../apps/web/e2e/helpers.js'),
  import('../apps/server/src/repository.js'),
  import('../apps/server/src/codexSessions.js'),
  import('../apps/server/src/codexRuns.js'),
  import('../packages/shared/src/index.js'),
])

const {
  appendRunPayloads,
  buildAgentMessageEvent,
  buildCommandCompletedEvent,
  buildCommandStartedEvent,
  buildReasoningEvent,
  buildSessionPayload,
  buildThreadStartedEvent,
  buildTurnCompletedEvent,
  buildTurnStartedEvent,
} = helpers

const {
  createTask,
  deleteTask,
} = repository

const {
  createPromptxCodexSession,
  deletePromptxCodexSession,
  updatePromptxCodexSession,
} = codexSessions

const {
  createCodexRun,
  updateCodexRun,
} = codexRuns

const {
  AGENT_ENGINES,
  BLOCK_TYPES,
} = shared

const createdTaskSlugs = []
const createdSessionIds = []
let stackProcess = null

function textBlock(content) {
  return {
    type: BLOCK_TYPES.TEXT,
    content,
  }
}

function importedBlock(content, fileName) {
  return {
    type: BLOCK_TYPES.IMPORTED_TEXT,
    content,
    meta: {
      fileName,
      collapsed: false,
    },
  }
}

function registerTask(task) {
  createdTaskSlugs.push(task.slug)
  return task
}

function registerSession(session) {
  createdSessionIds.push(session.id)
  return session
}

async function createShowcaseData() {
  const repoDir = workspaceRoot
  const webDir = path.join(workspaceRoot, 'apps', 'web')
  const runnerDir = path.join(workspaceRoot, 'apps', 'runner')

  const codexSession = registerSession(createPromptxCodexSession({
    title: 'PromptX 控制面',
    engine: AGENT_ENGINES.CODEX,
    cwd: repoDir,
  }))
  updatePromptxCodexSession(codexSession.id, {
    codexThreadId: 'thread_promptx_readme_codex',
    engineThreadId: 'thread_promptx_readme_codex',
  })

  const claudeSession = registerSession(createPromptxCodexSession({
    title: '前端工作台优化',
    engine: AGENT_ENGINES.CLAUDE_CODE,
    cwd: webDir,
  }))
  updatePromptxCodexSession(claudeSession.id, {
    engineSessionId: 'claude-session-readme',
    engineThreadId: 'claude-thread-readme',
  })

  const openCodeSession = registerSession(createPromptxCodexSession({
    title: 'Runner 并发实验',
    engine: AGENT_ENGINES.OPENCODE,
    cwd: runnerDir,
  }))
  updatePromptxCodexSession(openCodeSession.id, {
    engineSessionId: 'opencode-session-readme',
    engineThreadId: 'opencode-thread-readme',
  })

  const selectedTask = registerTask(createTask({
    title: '重写 README 与产品说明',
    autoTitle: 'README 重写',
    lastPromptPreview: '把 PromptX 写成更适合 Codex / Claude Code / OpenCode 用户的本机 AI 工作台。',
    codexSessionId: codexSession.id,
    blocks: [
      textBlock('目标：重写 README，突出 PromptX 针对 Codex / Claude Code / OpenCode 用户的输入输出体验。'),
      textBlock('需要强调：1. 先整理上下文再发送；2. 绑定固定目录与项目；3. 输出同时看过程、回复与代码变更；4. 多轮连续协作。'),
      importedBlock('README 现状\n- 产品定位偏轻\n- 截图数量较少\n- 多引擎价值表达还不够集中', 'readme-notes.md'),
    ],
    todoItems: [
      {
        id: 'todo-readme-1',
        createdAt: new Date().toISOString(),
        blocks: [
          textBlock('补齐安装、启动、使用流程与 Relay 文档入口。'),
        ],
      },
    ],
  }))

  registerTask(createTask({
    title: '整理 Claude Code 前端上下文',
    lastPromptPreview: '给组件改版前先把截图、交互目标、注意事项整理成一轮输入。',
    codexSessionId: claudeSession.id,
    blocks: [
      textBlock('为 Claude Code 准备一份可直接执行的前端改版任务。'),
    ],
  }))

  registerTask(createTask({
    title: '验证 OpenCode runner 稳定性',
    lastPromptPreview: '记录并发、停止、恢复等链路，方便回看每次 run 的结果。',
    codexSessionId: openCodeSession.id,
    blocks: [
      textBlock('重点验证 stop timeout、恢复机制和事件写回。'),
    ],
  }))

  const earlierRun = createCodexRun({
    taskSlug: selectedTask.slug,
    sessionId: codexSession.id,
    prompt: '请先分析 README 当前结构与表达问题。',
    promptBlocks: [
      textBlock('请先分析 README 当前结构与表达问题。'),
      textBlock('重点从目标用户、核心能力、安装方式、截图组织四个角度给建议。'),
    ],
  })
  await appendRunPayloads(earlierRun.id, [
    buildSessionPayload(codexSession, {
      started: true,
      engineThreadId: 'thread_promptx_readme_codex',
      codexThreadId: 'thread_promptx_readme_codex',
    }),
    buildThreadStartedEvent('thread_promptx_readme_codex'),
    buildTurnStartedEvent(),
    buildReasoningEvent('先梳理产品定位、目标用户和现有截图覆盖范围。'),
    buildCommandStartedEvent('Read README.md and docs/assets'),
    buildCommandCompletedEvent('Read README.md and docs/assets', '已确认 README 现有结构偏轻，截图只有 3 张。'),
    buildAgentMessageEvent('README 当前更像简短介绍，尚未把多引擎协作体验讲透。'),
    buildTurnCompletedEvent({ input_tokens: 1472, output_tokens: 382 }),
  ])
  updateCodexRun(earlierRun.id, {
    status: 'completed',
    responseMessage: '当前 README 的主要问题：\n\n- 对 Codex / Claude Code / OpenCode 用户的价值表达不够聚焦\n- 输入侧的上下文整理能力没有被突出\n- 输出侧的过程、回复、diff 三段式体验没有展开\n- 截图数量偏少，缺少主题、项目管理、系统面板等画面\n',
    finishedAt: new Date().toISOString(),
  })

  const latestRun = createCodexRun({
    taskSlug: selectedTask.slug,
    sessionId: codexSession.id,
    prompt: '请按 Codex / Claude Code / OpenCode 用户视角重写 README，并补充更完整的截图说明。',
    promptBlocks: [
      textBlock('请按 Codex / Claude Code / OpenCode 用户视角重写 README。'),
      textBlock('强调：先整理上下文、绑定固定目录、查看过程日志、查看最终回复、查看代码变更。'),
      importedBlock('截图计划\n1. 工作台总览\n2. 项目管理\n3. 主题设置\n4. 系统诊断\n5. Relay 面板', 'screenshot-plan.md'),
    ],
  })
  await appendRunPayloads(latestRun.id, [
    buildSessionPayload(codexSession, {
      started: true,
      engineThreadId: 'thread_promptx_readme_codex',
      codexThreadId: 'thread_promptx_readme_codex',
    }),
    buildThreadStartedEvent('thread_promptx_readme_codex'),
    buildTurnStartedEvent(),
    buildReasoningEvent('把输入体验、输出体验和多引擎统一面板拆成三个章节。'),
    buildCommandStartedEvent('Draft README sections and screenshot plan'),
    buildCommandCompletedEvent('Draft README sections and screenshot plan', '已生成 README 提纲、截图清单与展示顺序。'),
    buildAgentMessageEvent('准备把 README 改成面向 agent CLI 用户的产品说明，并补上 Glass Light 皮肤截图。'),
    buildTurnCompletedEvent({ input_tokens: 2510, output_tokens: 816 }),
  ])
  updateCodexRun(latestRun.id, {
    status: 'completed',
    responseMessage: '已整理新的 README 方向：\n\n- 更突出 **先整理再发送** 的输入体验\n- 更突出 **过程 / 回复 / Diff 同页查看** 的输出体验\n- 更明确说明 **Codex / Claude Code / OpenCode** 共用同一套任务与项目面板\n- 补充更多系统截图，统一使用 Glass Light 主题来展示整体气质\n',
    finishedAt: new Date().toISOString(),
  })

  return {
    selectedTask,
  }
}

async function canReach(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitForUrl(url, timeoutMs = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReach(url)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`等待服务启动超时：${url}`)
}

async function startStack() {
  stackProcess = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  stackProcess.stdout.on('data', (chunk) => {
    process.stdout.write(String(chunk || ''))
  })
  stackProcess.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk || ''))
  })

  await Promise.all([
    waitForUrl(baseUrl),
    waitForUrl(`${apiUrl}/api/tasks`),
  ])
}

async function stopStack() {
  if (!stackProcess || stackProcess.killed) {
    return
  }

  await new Promise((resolve) => {
    stackProcess.once('exit', () => resolve())

    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(stackProcess.pid), '/T', '/F'], () => resolve())
      setTimeout(resolve, 2000)
      return
    }

    stackProcess.kill('SIGTERM')
    setTimeout(resolve, 2000)
  })
}

async function setGlassTheme(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('promptx:theme-id', 'promptx-glass-light')
  })
}

async function expandVisibleButtons(page, namePattern, limit = 6) {
  const buttons = page.getByRole('button', { name: namePattern })
  const count = await buttons.count()
  for (let index = 0; index < Math.min(count, limit); index += 1) {
    await buttons.nth(index).click().catch(() => {})
    await page.waitForTimeout(120)
  }
}

async function closeTopDialog(page) {
  const closeButton = page.locator('.theme-modal-backdrop .theme-icon-button').last()
  await closeButton.click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)
}

function clampClip(clip, viewport) {
  const x = Math.max(0, Math.floor(clip.x))
  const y = Math.max(0, Math.floor(clip.y))
  const width = Math.max(1, Math.min(Math.floor(clip.width), viewport.width - x))
  const height = Math.max(1, Math.min(Math.floor(clip.height), viewport.height - y))

  return { x, y, width, height }
}

async function captureExecutionFocus(page) {
  const promptCard = page.locator('.transcript-card--prompt').first()
  const processCard = page.locator('.transcript-card--process').first()
  const responseCard = page.locator('.transcript-card--response').first()

  await processCard.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)

  const [promptBox, processBox, responseBox] = await Promise.all([
    promptCard.boundingBox(),
    processCard.boundingBox(),
    responseCard.boundingBox(),
  ])

  const boxes = [promptBox, processBox, responseBox].filter(Boolean)
  if (!boxes.length) {
    return
  }

  const left = Math.min(...boxes.map((item) => item.x)) - 32
  const top = Math.min(...boxes.map((item) => item.y)) - 32
  const right = Math.max(...boxes.map((item) => item.x + item.width)) + 32
  const bottom = Math.max(...boxes.map((item) => item.y + item.height)) + 32
  const viewport = page.viewportSize() || { width: 1600, height: 1080 }

  await page.screenshot({
    path: path.join(outputDir, 'readme-execution-focus-glass.png'),
    clip: clampClip({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }, viewport),
  })
}

async function captureMobileRemote(selectedTaskSlug, browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })

  try {
    const page = await context.newPage()
    await setGlassTheme(page)
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForSelector('text=PromptX 工作台', { timeout: 30000 })
    await page.getByText('重写 README 与产品说明').first().click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: '执行' }).click().catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({
      path: path.join(outputDir, 'readme-mobile-remote-glass.png'),
      fullPage: false,
    })
  } finally {
    await context.close()
  }
}

async function captureScreenshots(selectedTaskSlug) {
  await startStack()

  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1080 },
      deviceScaleFactor: 1.5,
    })
    const page = await context.newPage()
    await setGlassTheme(page)
    await page.goto(`${baseUrl}/?task=${encodeURIComponent(selectedTaskSlug)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForSelector('text=本轮提示词', { timeout: 30000 })
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' })
    await expandVisibleButtons(page, /展开/, 4)
    await page.waitForTimeout(800)

    await page.screenshot({
      path: path.join(outputDir, 'readme-workbench-glass.png'),
      fullPage: false,
    })
    await captureExecutionFocus(page)

    await page.getByRole('button', { name: '管理项目' }).click()
    await page.waitForSelector('text=项目列表', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, 'readme-project-manager-glass.png'),
      fullPage: false,
    })
    await closeTopDialog(page)

    await page.getByRole('button', { name: '设置' }).click()
    await page.waitForSelector('text=界面主题', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, 'readme-settings-theme-glass.png'),
      fullPage: false,
    })

    await page.locator('button').filter({ hasText: '远程' }).first().click()
    await page.waitForSelector('text=启用远程访问', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, 'readme-settings-relay-glass.png'),
      fullPage: false,
    })

    await page.locator('button').filter({ hasText: '系统' }).first().click()
    await page.waitForSelector('text=真实 agent 最大并发数', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, 'readme-settings-system-glass.png'),
      fullPage: false,
    })

    await closeTopDialog(page)
    await page.getByRole('button', { name: '代码变更' }).click()
    await page.waitForSelector('text=当前变更', { timeout: 10000 })
    await page.waitForTimeout(1200)
    await page.locator('button').filter({ hasText: 'README.md' }).first().click().catch(() => {})
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(outputDir, 'readme-diff-glass.png'),
      fullPage: false,
    })

    await captureMobileRemote(selectedTaskSlug, browser)

    await context.close()
  } finally {
    await browser.close()
    await stopStack()
  }
}

async function cleanupShowcaseData() {
  for (const taskSlug of createdTaskSlugs.reverse()) {
    try {
      deleteTask(taskSlug)
    } catch {}
  }

  for (const sessionId of createdSessionIds.reverse()) {
    try {
      deletePromptxCodexSession(sessionId)
    } catch {}
  }
}

let exitCode = 0

try {
  fs.mkdirSync(outputDir, { recursive: true })
  const { selectedTask } = await createShowcaseData()
  await captureScreenshots(selectedTask.slug)
} catch (error) {
  exitCode = 1
  console.error(error)
} finally {
  await cleanupShowcaseData()
}

process.exit(exitCode)
