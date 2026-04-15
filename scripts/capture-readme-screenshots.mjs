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
  openWorkbenchTask,
} = helpers

const {
  createTask,
  deleteTask,
  updateTaskCodexSession,
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
let serverProcess = null
let webProcess = null
const screenshotNames = {
  workbench: 'readme-workbench-wechat.png',
  execution: 'readme-execution-focus-wechat.png',
  manager: 'readme-project-manager-wechat.png',
  source: 'readme-source-browser-wechat.png',
  settingsTheme: 'readme-settings-theme-wechat.png',
  settingsSystem: 'readme-settings-system-wechat.png',
  diff: 'readme-diff-wechat.png',
  mobile: 'readme-mobile-wechat.png',
}

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

  const projectSession = registerSession(createPromptxCodexSession({
    title: 'PromptX 多 Agent 协作',
    engine: AGENT_ENGINES.CODEX,
    cwd: repoDir,
    agentEngines: [
      AGENT_ENGINES.CODEX,
      AGENT_ENGINES.CLAUDE_CODE,
      AGENT_ENGINES.OPENCODE,
    ],
  }))
  const projectBindings = new Map((projectSession.agentBindings || []).map((item) => [item.engine, item.sessionRecordId]))
  const codexSessionId = projectBindings.get(AGENT_ENGINES.CODEX) || projectSession.id
  const claudeMemberId = projectBindings.get(AGENT_ENGINES.CLAUDE_CODE) || projectSession.id
  const openCodeMemberId = projectBindings.get(AGENT_ENGINES.OPENCODE) || projectSession.id

  updatePromptxCodexSession(codexSessionId, {
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

  updatePromptxCodexSession(claudeMemberId, {
    engineSessionId: 'claude-session-project',
    engineThreadId: 'claude-thread-project',
  })
  updatePromptxCodexSession(openCodeMemberId, {
    engineSessionId: 'opencode-session-project',
    engineThreadId: 'opencode-thread-project',
  })

  const selectedTask = registerTask(createTask({
    title: '准备 README 更新与产品截图',
    autoTitle: 'README 更新',
    lastPromptPreview: '整理多 Agent、源码查看、Diff、手机端与微信主题截图，更新 README。',
    codexSessionId: projectSession.id,
    blocks: [
      textBlock('目标：更新 README，突出 PromptX 最近补齐的多 Agent、源码查看、代码变更、移动端与微信主题。'),
      textBlock('需要强调：1. 任务/项目/目录/线程结构；2. 一个项目可挂多个 Agent；3. Prompt / 过程 / 回复 / Diff / 源码查看同页协作。'),
      importedBlock('本轮截图清单\n- 工作台总览\n- 多 Agent 项目管理\n- 只读源码查看\n- 代码变更审查\n- 设置页\n- 手机端', 'readme-notes.md'),
    ],
    todoItems: [
      {
        id: 'todo-readme-1',
        createdAt: new Date().toISOString(),
        blocks: [
          textBlock('同步更新中英文 README，并替换成微信主题截图。'),
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
    sessionId: claudeMemberId,
    prompt: '先从 PromptX 最近新增的功能里挑出 README 里必须讲清楚的点。',
    promptBlocks: [
      textBlock('请先盘点 PromptX 最近新增的能力。'),
      textBlock('重点看：多 Agent 项目、源码查看、内容搜索、Diff 审查、插入上下文、移动端体验。'),
    ],
  })
  await appendRunPayloads(earlierRun.id, [
    buildSessionPayload({
      id: claudeMemberId,
      title: projectSession.title,
      engine: AGENT_ENGINES.CLAUDE_CODE,
      cwd: repoDir,
      started: true,
      codexThreadId: '',
      engineSessionId: 'claude-session-project',
      engineThreadId: 'claude-thread-project',
    }, {
      started: true,
      engineSessionId: 'claude-session-project',
      engineThreadId: 'claude-thread-project',
    }),
    buildThreadStartedEvent('claude-thread-project'),
    buildTurnStartedEvent(),
    buildReasoningEvent('先把最近的关键能力梳出来，确认 README 不能再停留在旧版 3 张图。'),
    buildCommandStartedEvent('Read README.md, CHANGELOG.md, docs/assets'),
    buildCommandCompletedEvent('Read README.md, CHANGELOG.md, docs/assets', '已确认近期增加了多 Agent、源码查看、Diff 审查与微信主题。'),
    buildAgentMessageEvent('README 应该把“一个项目可挂多个 Agent”“源码查看和 Diff 审查”讲得更前。'),
    buildTurnCompletedEvent({ input_tokens: 1472, output_tokens: 382 }),
  ])
  updateCodexRun(earlierRun.id, {
    status: 'completed',
    responseMessage: '这轮 README 更新建议优先突出：\n\n- **一个项目可挂多个 Agent**，右侧直接切换发送目标\n- **源码查看与内容搜索**，能在同一工作台里只读浏览代码\n- **代码变更审查**，支持看 workspace / 任务累计 / 单轮 diff\n- **输入与输出闭环**，可把 Prompt、回复、源码、Diff 再插回编辑区继续下一轮\n',
    finishedAt: new Date().toISOString(),
  })

  const latestRun = createCodexRun({
    taskSlug: selectedTask.slug,
    sessionId: codexSessionId,
    prompt: '按近期产品形态重写 README，截图改成微信主题，并多展示几个关键场景。',
    promptBlocks: [
      textBlock('请按 PromptX 当前产品形态重写 README。'),
      textBlock('强调：多 Agent、源码查看、代码变更、插入上下文、移动端与微信主题。'),
      importedBlock('截图计划\n1. 工作台总览\n2. 多 Agent 项目管理\n3. 源码查看\n4. 代码变更\n5. 设置\n6. 手机端', 'screenshot-plan.md'),
    ],
  })
  await appendRunPayloads(latestRun.id, [
    buildSessionPayload({
      id: codexSessionId,
      title: projectSession.title,
      engine: AGENT_ENGINES.CODEX,
      cwd: repoDir,
      started: true,
      codexThreadId: 'thread_promptx_readme_codex',
      engineSessionId: '',
      engineThreadId: 'thread_promptx_readme_codex',
    }, {
      started: true,
      engineThreadId: 'thread_promptx_readme_codex',
      codexThreadId: 'thread_promptx_readme_codex',
    }),
    buildThreadStartedEvent('thread_promptx_readme_codex'),
    buildTurnStartedEvent(),
    buildReasoningEvent('把 README 改成“快速开始 + 关键能力 + 多场景截图 + 适用场景”的结构。'),
    buildCommandStartedEvent('Draft README sections, screenshot plan, and image captions'),
    buildCommandCompletedEvent('Draft README sections, screenshot plan, and image captions', '已生成新版 README 提纲与微信主题截图清单。'),
    buildAgentMessageEvent('准备把 README 的截图统一切到 WeChat 主题，并把项目管理、源码查看、代码变更都放进展示区。'),
    buildTurnCompletedEvent({ input_tokens: 2510, output_tokens: 816 }),
  ])
  updateCodexRun(latestRun.id, {
    status: 'completed',
    responseMessage: '新版 README 方向已经确定：\n\n- 更明确说明 **任务 -> 项目 -> 目录 -> 线程 -> Run -> Diff** 这一层结构\n- 更突出 **一个项目可挂多个 Agent**，以及 PromptX 与 CLI 双向复用会话\n- 更完整展示 **工作台总览 / 项目管理 / 源码查看 / 代码变更 / 设置 / 手机端**\n- 所有主图统一切到 **WeChat 主题**，让整体视觉更贴近当前产品状态\n',
    finishedAt: new Date().toISOString(),
  })

  const openCodeRun = createCodexRun({
    taskSlug: selectedTask.slug,
    sessionId: openCodeMemberId,
    prompt: '再补一轮，把 README 截图区改成分场景展示，并强调只读源码查看和插入编辑区。',
    promptBlocks: [
      textBlock('再补一轮，把 README 截图区改成分场景展示。'),
      textBlock('记得强调：源码查看、内容搜索、从 Prompt/回复/Diff/源码把上下文插回编辑区。'),
    ],
  })
  await appendRunPayloads(openCodeRun.id, [
    buildSessionPayload({
      id: openCodeMemberId,
      title: projectSession.title,
      engine: AGENT_ENGINES.OPENCODE,
      cwd: repoDir,
      started: true,
      codexThreadId: '',
      engineSessionId: 'opencode-session-project',
      engineThreadId: 'opencode-thread-project',
    }, {
      started: true,
      engineSessionId: 'opencode-session-project',
      engineThreadId: 'opencode-thread-project',
    }),
    buildThreadStartedEvent('opencode-thread-project'),
    buildTurnStartedEvent(),
    buildReasoningEvent('补充截图标题和场景说明，让 README 更像产品说明而不是简短介绍。'),
    buildCommandStartedEvent('Review screenshot set and README section order'),
    buildCommandCompletedEvent('Review screenshot set and README section order', '已确认需要补工作台、项目管理、源码查看、Diff、设置、手机端 6 类场景。'),
    buildAgentMessageEvent('建议把“为什么好用”改成更偏本机 Agent 用户的使用路径。'),
    buildTurnCompletedEvent({ input_tokens: 980, output_tokens: 260 }),
  ])
  updateCodexRun(openCodeRun.id, {
    status: 'completed',
    responseMessage: '可以把 README 的截图区调整为：\n\n- 工作台总览\n- 多 Agent 项目管理\n- 源码查看与搜索\n- 代码变更审查\n- 设置与系统\n- 手机端远程访问\n',
    finishedAt: new Date().toISOString(),
  })

  updateTaskCodexSession(selectedTask.slug, projectSession.id)

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
  serverProcess = spawn('pnpm', ['--filter', '@promptx/server', 'dev'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  webProcess = spawn('pnpm', ['--filter', '@promptx/web', 'exec', 'vite', '--host', '127.0.0.1', '--port', webPort], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      VITE_API_PORT: serverPort,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(String(chunk || ''))
  })
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk || ''))
  })
  webProcess.stdout.on('data', (chunk) => {
    process.stdout.write(String(chunk || ''))
  })
  webProcess.stderr.on('data', (chunk) => {
    process.stderr.write(String(chunk || ''))
  })

  await Promise.all([
    waitForUrl(baseUrl),
    waitForUrl(`${apiUrl}/api/tasks`),
  ])
}

async function stopStack() {
  const processes = [webProcess, serverProcess].filter(Boolean)
  for (const child of processes) {
    if (!child || child.killed) {
      continue
    }

    await new Promise((resolve) => {
      child.once('exit', () => resolve())

      if (process.platform === 'win32') {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
        setTimeout(resolve, 2000)
        return
      }

      child.kill('SIGTERM')
      setTimeout(resolve, 2000)
    })
  }

  serverProcess = null
  webProcess = null
}

async function setWechatTheme(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('promptx:theme-id', 'promptx-wechat-light')
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
    path: path.join(outputDir, screenshotNames.execution),
    clip: clampClip({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }, viewport),
  })
}

async function captureMobileRemote(selectedTaskSlug, selectedTaskTitle, browser) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })

  try {
    const page = await context.newPage()
    await setWechatTheme(page)
    await page.goto(`${baseUrl}/?task=${encodeURIComponent(selectedTaskSlug)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForSelector('text=PromptX 工作台', { timeout: 30000 }).catch(() => {})
    if (selectedTaskTitle) {
      await page.getByText(selectedTaskTitle).first().click().catch(() => {})
    }
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: '执行' }).click().catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.mobile),
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
    await setWechatTheme(page)
    await openWorkbenchTask(page, selectedTaskSlug, { baseUrl })
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' })
    await expandVisibleButtons(page, /展开/, 4)
    await page.waitForTimeout(800)

    await page.screenshot({
      path: path.join(outputDir, screenshotNames.workbench),
      fullPage: false,
    })
    await captureExecutionFocus(page)

    await page.getByRole('button', { name: '管理项目' }).click()
    await page.waitForSelector('text=项目列表', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.manager),
      fullPage: false,
    })

    await page.getByRole('button', { name: '查看源码' }).click()
    await page.waitForSelector('input[placeholder=\"搜索文件名或路径片段\"]', { timeout: 10000 })
    await page.getByPlaceholder('搜索文件名或路径片段').fill('README')
    await page.waitForTimeout(700)
    await page.getByText('README.md').first().click().catch(() => {})
    await page.waitForTimeout(900)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.source),
      fullPage: false,
    })
    await closeTopDialog(page)
    await closeTopDialog(page)

    await page.getByRole('button', { name: '设置' }).click()
    await page.waitForSelector('text=界面主题', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.settingsTheme),
      fullPage: false,
    })

    await page.locator('button').filter({ hasText: '系统' }).first().click()
    await page.waitForSelector('text=真实 agent 最大并发数', { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.settingsSystem),
      fullPage: false,
    })

    await closeTopDialog(page)
    await page.getByRole('button', { name: '代码变更' }).click()
    await page.waitForSelector('text=当前变更', { timeout: 10000 })
    await page.waitForTimeout(1200)
    await page.locator('button').filter({ hasText: 'README.md' }).first().click().catch(() => {})
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(outputDir, screenshotNames.diff),
      fullPage: false,
    })

    await captureMobileRemote(selectedTaskSlug, '准备 README 更新与产品截图', browser)

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
