import assert from 'node:assert/strict'
import test from 'node:test'

import { createRunDispatchService } from './runDispatchService.js'

test('runDispatchService keeps queued status when runner accepts queued run', async () => {
  const broadcasts = []
  const service = createRunDispatchService({
    broadcastServerEvent(type, payload = {}) {
      broadcasts.push({ type, ...payload })
    },
    createCodexRun(payload = {}) {
      return {
        id: 'run-1',
        status: payload.status || 'queued',
      }
    },
    decorateCodexSession(session) {
      return {
        ...session,
        running: false,
      }
    },
    getCodexRunById() {
      return {
        id: 'run-1',
        status: 'queued',
      }
    },
    getPromptxCodexSessionById() {
      return {
        id: 'session-1',
        engine: 'codex',
        cwd: '/tmp/demo',
        title: 'Demo',
        codexThreadId: '',
        engineSessionId: '',
        engineThreadId: '',
        engineMeta: {},
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: '2026-03-22T00:00:00.000Z',
      }
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-1',
        expired: false,
      }
    },
    logger: {
      warn() {},
    },
    runnerClient: {
      async startRun() {
        return {
          status: 'queued',
        }
      },
    },
    updateCodexRunFromRunnerStatus(_runId, patch = {}) {
      return {
        id: 'run-1',
        status: patch.status || 'queued',
      }
    },
    updateTaskCodexSession() {},
  })

  const result = await service.startTaskRunForTask({
    taskSlug: 'task-1',
    sessionId: 'session-1',
    prompt: 'hello',
    promptBlocks: [],
  })

  assert.equal(result.runnerDispatchPending, false)
  assert.equal(result.run?.status, 'queued')
  assert.ok(broadcasts.some((item) => item.type === 'runs.changed' && item.status === 'queued'))
})

test('runDispatchService dispatches shell command runs with project cwd', async () => {
  let createdRunPayload = null
  let runnerPayload = null
  let selectedSessionIds = []
  const service = createRunDispatchService({
    createCodexRun(payload = {}) {
      createdRunPayload = payload
      return {
        id: 'run-shell-1',
        status: payload.status || 'queued',
      }
    },
    decorateCodexSession(session) {
      return {
        ...session,
        running: false,
      }
    },
    getCodexRunById() {
      return {
        id: 'run-shell-1',
        status: 'queued',
      }
    },
    getPromptxCodexSessionById(sessionId) {
      selectedSessionIds.push(sessionId)
      if (sessionId === 'session-1') {
        return {
          id: 'session-1',
          engine: 'codex',
          cwd: '/tmp/demo-shell',
          title: 'Demo Shell',
          codexThreadId: 'thread-root',
          engineSessionId: '',
          engineThreadId: 'thread-root',
          engineMeta: { root: true },
          createdAt: '2026-03-22T00:00:00.000Z',
          updatedAt: '2026-03-22T00:00:00.000Z',
        }
      }
      return {
        id: 'member-claude',
        engine: 'claude-code',
        cwd: '/tmp/demo-shell',
        title: 'Claude Member',
        codexThreadId: '',
        engineSessionId: 'claude-session-1',
        engineThreadId: 'claude-thread-1',
        engineMeta: { hidden: true },
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: '2026-03-22T00:00:00.000Z',
      }
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-shell-1',
        expired: false,
      }
    },
    logger: {
      warn() {},
    },
    runnerClient: {
      async startRun(payload = {}) {
        runnerPayload = payload
        return {
          status: 'queued',
        }
      },
    },
    updateCodexRunFromRunnerStatus(_runId, patch = {}) {
      return {
        id: 'run-shell-1',
        status: patch.status || 'queued',
      }
    },
    updateTaskCodexSession() {},
  })

  await service.startTaskRunForTask({
    taskSlug: 'task-shell-1',
    projectSessionId: 'session-1',
    sessionId: 'member-claude',
    displayEngine: 'claude-code',
    prompt: '!git status --short',
    promptBlocks: [{ type: 'text', content: '!git status --short', meta: {} }],
    commandMode: 'shell',
    command: 'echo hacked',
    allowShellCommand: true,
  })

  assert.equal(createdRunPayload?.engine, 'shell')
  assert.equal(createdRunPayload?.displayEngine, 'claude-code')
  assert.equal(createdRunPayload?.sessionId, 'session-1')
  assert.equal(createdRunPayload?.prompt, '!git status --short')
  assert.equal(runnerPayload?.engine, 'shell')
  assert.equal(runnerPayload?.prompt, 'git status --short')
  assert.equal(runnerPayload?.cwd, '/tmp/demo-shell')
  assert.equal(runnerPayload?.sessionId, 'session-1')
  assert.equal(runnerPayload?.codexThreadId, '')
  assert.equal(runnerPayload?.engineSessionId, '')
  assert.equal(runnerPayload?.engineThreadId, '')
  assert.deepEqual(runnerPayload?.engineMeta, {})
  assert.deepEqual(selectedSessionIds, ['member-claude', 'session-1', 'session-1'])
})

test('runDispatchService rejects shell runs from non-local requests', async () => {
  const service = createRunDispatchService({
    getPromptxCodexSessionById() {
      return {
        id: 'session-1',
        engine: 'codex',
        cwd: '/tmp/demo-shell',
        title: 'Demo Shell',
      }
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-shell-1',
        expired: false,
      }
    },
  })

  await assert.rejects(
    () => service.startTaskRunForTask({
      taskSlug: 'task-shell-1',
      sessionId: 'session-1',
      prompt: '!pwd',
      promptBlocks: [{ type: 'text', content: '!pwd' }],
      commandMode: 'shell',
      allowShellCommand: false,
    }),
    (error) => error?.statusCode === 403 && error?.messageKey === 'errors.shellLocalOnly'
  )
})

test('runDispatchService marks stop request as stopping and returns accepted result', async () => {
  const broadcasts = []
  let currentStatus = 'running'
  const service = createRunDispatchService({
    broadcastServerEvent(type, payload = {}) {
      broadcasts.push({ type, ...payload })
    },
    getCodexRunById(runId) {
      return {
        id: runId,
        taskSlug: 'task-1',
        sessionId: 'session-1',
        status: currentStatus,
      }
    },
    logger: {
      warn() {},
    },
    runnerClient: {
      stopRun() {
        return Promise.resolve({ accepted: true })
      },
    },
    updateCodexRunFromRunnerStatus(runId, patch = {}) {
      currentStatus = patch.status || currentStatus
      return {
        id: runId,
        taskSlug: 'task-1',
        sessionId: 'session-1',
        status: currentStatus,
      }
    },
  })

  const result = await service.requestRunStop('run-1', {
    isActiveRunStatus(status) {
      return ['queued', 'starting', 'running', 'stopping'].includes(status)
    },
    reason: 'user_requested',
  })

  assert.equal(result?.accepted, true)
  assert.equal(result?.run?.status, 'stopping')
  assert.ok(broadcasts.some((item) => item.type === 'runs.changed' && item.status === 'stopping'))
  assert.ok(broadcasts.some((item) => item.type === 'sessions.changed' && item.sessionId === 'session-1'))
})

test('runDispatchService rewrites codex image urls to local server for runner payload only', async () => {
  let createdRunPayload = null
  let runnerPayload = null
  const service = createRunDispatchService({
    createCodexRun(payload = {}) {
      createdRunPayload = payload
      return {
        id: 'run-1',
        status: payload.status || 'queued',
      }
    },
    decorateCodexSession(session) {
      return {
        ...session,
        running: false,
      }
    },
    getCodexRunById() {
      return {
        id: 'run-1',
        status: 'queued',
      }
    },
    getPromptxCodexSessionById() {
      return {
        id: 'session-1',
        engine: 'codex',
        cwd: '/tmp/demo',
        title: 'Demo',
        codexThreadId: '',
        engineSessionId: '',
        engineThreadId: '',
        engineMeta: {},
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: '2026-03-22T00:00:00.000Z',
      }
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-1',
        expired: false,
      }
    },
    localServerBaseUrl: 'http://127.0.0.1:3000',
    publicServerBaseUrl: 'https://dongdong.promptx.mushayu.com',
    relayUrl: 'https://dongdong.promptx.mushayu.com',
    logger: {
      warn() {},
    },
    runnerClient: {
      async startRun(payload = {}) {
        runnerPayload = payload
        return {
          status: 'queued',
        }
      },
    },
    updateCodexRunFromRunnerStatus(_runId, patch = {}) {
      return {
        id: 'run-1',
        status: patch.status || 'queued',
      }
    },
    updateTaskCodexSession() {},
  })

  await service.startTaskRunForTask({
    taskSlug: 'task-1',
    sessionId: 'session-1',
    prompt: '看图：https://dongdong.promptx.mushayu.com/uploads/demo.png',
    promptBlocks: [
      {
        type: 'image',
        content: '/uploads/demo.png',
        meta: {},
      },
    ],
  })

  assert.equal(createdRunPayload?.prompt, '看图：https://dongdong.promptx.mushayu.com/uploads/demo.png')
  assert.equal(createdRunPayload?.promptBlocks?.[0]?.content, '/uploads/demo.png')
  assert.equal(runnerPayload?.prompt, '看图：http://127.0.0.1:3000/uploads/demo.png')
  assert.equal(runnerPayload?.promptBlocks?.[0]?.content, 'http://127.0.0.1:3000/uploads/demo.png')
})

test('runDispatchService adapts local image base url for claude dev server port', async () => {
  let runnerPayload = null
  const service = createRunDispatchService({
    createCodexRun(payload = {}) {
      return {
        id: 'run-2',
        status: payload.status || 'queued',
      }
    },
    decorateCodexSession(session) {
      return {
        ...session,
        running: false,
      }
    },
    getCodexRunById() {
      return {
        id: 'run-2',
        status: 'queued',
      }
    },
    getPromptxCodexSessionById() {
      return {
        id: 'session-2',
        engine: 'claude-code',
        cwd: '/tmp/demo',
        title: 'Demo',
        codexThreadId: '',
        engineSessionId: '',
        engineThreadId: '',
        engineMeta: {},
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: '2026-03-22T00:00:00.000Z',
      }
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-2',
        expired: false,
      }
    },
    localServerBaseUrl: 'http://127.0.0.1:3001',
    publicServerBaseUrl: 'https://dongdong.promptx.mushayu.com',
    relayUrl: 'https://dongdong.promptx.mushayu.com',
    logger: {
      warn() {},
    },
    runnerClient: {
      async startRun(payload = {}) {
        runnerPayload = payload
        return {
          status: 'queued',
        }
      },
    },
    updateCodexRunFromRunnerStatus(_runId, patch = {}) {
      return {
        id: 'run-2',
        status: patch.status || 'queued',
      }
    },
    updateTaskCodexSession() {},
  })

  await service.startTaskRunForTask({
    taskSlug: 'task-2',
    sessionId: 'session-2',
    prompt: '看图：https://dongdong.promptx.mushayu.com/uploads/demo-2.png',
    promptBlocks: [
      {
        type: 'image',
        content: 'https://dongdong.promptx.mushayu.com/uploads/demo-2.png',
        meta: {},
      },
    ],
  })

  assert.equal(runnerPayload?.prompt, '看图：http://127.0.0.1:3001/uploads/demo-2.png')
  assert.equal(runnerPayload?.promptBlocks?.[0]?.content, 'http://127.0.0.1:3001/uploads/demo-2.png')
})

test('runDispatchService 在多 agent 项目中把 run 绑定到实际 member session，并回写 root 项目 session', async () => {
  let createdRunPayload = null
  let updatedTaskSession = null
  let runnerPayload = null
  const rootSession = {
    id: 'project-root',
    engine: 'codex',
    cwd: '/tmp/demo',
    title: 'Multi Agent Project',
    codexThreadId: '',
    engineSessionId: '',
    engineThreadId: '',
    engineMeta: {},
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
    agentBindings: [
      { engine: 'codex', sessionRecordId: 'project-root', isDefault: true },
      { engine: 'claude-code', sessionRecordId: 'member-claude', isDefault: false },
      { engine: 'opencode', sessionRecordId: 'member-opencode', isDefault: false },
    ],
  }
  const memberClaudeSession = {
    id: 'member-claude',
    engine: 'claude-code',
    cwd: '/tmp/demo',
    title: 'Multi Agent Project',
    codexThreadId: '',
    engineSessionId: 'claude-existing',
    engineThreadId: 'claude-existing',
    engineMeta: {
      hidden: true,
      projectRootId: 'project-root',
    },
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
  }

  const service = createRunDispatchService({
    createCodexRun(payload = {}) {
      createdRunPayload = payload
      return {
        id: 'run-member-1',
        taskSlug: payload.taskSlug,
        sessionId: payload.sessionId,
        status: payload.status || 'queued',
      }
    },
    decorateCodexSession(session) {
      return {
        ...session,
        running: false,
      }
    },
    getCodexRunById() {
      return {
        id: 'run-member-1',
        status: 'queued',
      }
    },
    getPromptxCodexSessionById(sessionId) {
      if (sessionId === 'project-root') {
        return rootSession
      }
      if (sessionId === 'member-claude') {
        return memberClaudeSession
      }
      return null
    },
    getRunningCodexRunBySessionId() {
      return null
    },
    getTaskBySlug() {
      return {
        slug: 'task-1',
        expired: false,
      }
    },
    logger: {
      warn() {},
    },
    runnerClient: {
      async startRun(payload = {}) {
        runnerPayload = payload
        return {
          status: 'queued',
        }
      },
    },
    updateCodexRunFromRunnerStatus(_runId, patch = {}) {
      return {
        id: 'run-member-1',
        taskSlug: 'task-1',
        sessionId: createdRunPayload?.sessionId || 'member-claude',
        status: patch.status || 'queued',
      }
    },
    updateTaskCodexSession(taskSlug, sessionId) {
      updatedTaskSession = { taskSlug, sessionId }
    },
  })

  const result = await service.startTaskRunForTask({
    taskSlug: 'task-1',
    sessionId: 'member-claude',
    projectSessionId: 'project-root',
    prompt: 'hello',
    promptBlocks: [],
  })

  assert.equal(createdRunPayload?.sessionId, 'member-claude')
  assert.equal(updatedTaskSession?.taskSlug, 'task-1')
  assert.equal(updatedTaskSession?.sessionId, 'project-root')
  assert.equal(runnerPayload?.sessionId, 'member-claude')
  assert.equal(runnerPayload?.engine, 'claude-code')
  assert.equal(runnerPayload?.engineSessionId, 'claude-existing')
  assert.equal(result?.run?.sessionId, 'member-claude')
  assert.equal(result?.session?.id, 'project-root')
})
