import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('未启动的项目允许切换执行引擎，已启动后不允许', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDir = path.join(tempDir, 'workspace')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const { createPromptxCodexSession, updatePromptxCodexSession } = await import(`./codexSessions.js?test=${Date.now()}`)

    const created = createPromptxCodexSession({
      title: 'Engine Switch Test',
      cwd: workspaceDir,
      engine: 'codex',
    })

    const switched = updatePromptxCodexSession(created.id, {
      engine: 'opencode',
    })

    assert.equal(switched?.engine, 'opencode')

    const started = updatePromptxCodexSession(created.id, {
      codexThreadId: 'thread-1',
      engineThreadId: 'thread-1',
    })

    assert.equal(started?.started, true)

    assert.throws(() => {
      updatePromptxCodexSession(created.id, {
        engine: 'claude-code',
      })
    }, /不能直接切换执行引擎/)
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})

test('手动填写会话 ID 后，项目在真正运行前仍允许修改，运行后锁定', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-manual-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDirA = path.join(tempDir, 'workspace-a')
  const workspaceDirB = path.join(tempDir, 'workspace-b')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDirA, { recursive: true })
  fs.mkdirSync(workspaceDirB, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const { createPromptxCodexSession, updatePromptxCodexSession } = await import(`./codexSessions.js?test=${Date.now()}`)

    const created = createPromptxCodexSession({
      title: 'Resume Existing Session',
      cwd: workspaceDirA,
      engine: 'codex',
      sessionId: 'thread-manual-1',
    })

    assert.equal(created?.started, false)
    assert.equal(created?.sessionId, 'thread-manual-1')
    assert.equal(created?.engineMeta?.manualSessionBinding, true)

    const updatedBeforeStart = updatePromptxCodexSession(created.id, {
      cwd: workspaceDirB,
      engine: 'claude-code',
      sessionId: 'claude-session-2',
    })

    assert.equal(updatedBeforeStart?.started, false)
    assert.equal(updatedBeforeStart?.cwd, workspaceDirB)
    assert.equal(updatedBeforeStart?.engine, 'claude-code')
    assert.equal(updatedBeforeStart?.sessionId, 'claude-session-2')
    assert.equal(updatedBeforeStart?.engineSessionId, 'claude-session-2')
    assert.equal(updatedBeforeStart?.engineThreadId, 'claude-session-2')

    const started = updatePromptxCodexSession(created.id, {
      engineSessionId: 'claude-session-2',
      engineThreadId: 'claude-session-2',
      clearManualSessionBinding: true,
    })

    assert.equal(started?.started, true)
    assert.equal(started?.engineMeta?.manualSessionBinding, undefined)

    assert.throws(() => {
      updatePromptxCodexSession(created.id, {
        sessionId: 'claude-session-3',
      })
    }, /不能直接修改会话 ID/)

    assert.throws(() => {
      updatePromptxCodexSession(created.id, {
        cwd: workspaceDirA,
      })
    }, /不能直接修改工作目录/)

    assert.throws(() => {
      updatePromptxCodexSession(created.id, {
        engine: 'opencode',
      })
    }, /不能直接切换执行引擎/)
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})

test('项目可以挂多个 agent，并且列表只返回 root 项目', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-multi-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDir = path.join(tempDir, 'workspace')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const {
      createPromptxCodexSession,
      getPromptxCodexSessionById,
      listPromptxCodexSessions,
      updatePromptxCodexSession,
    } = await import(`./codexSessions.js?test=${Date.now()}`)

    const created = createPromptxCodexSession({
      title: 'Multi Agent Project',
      cwd: workspaceDir,
      engine: 'codex',
      agentEngines: ['codex', 'claude-code', 'opencode'],
    })

    assert.equal(created?.agentBindings?.length, 3)
    assert.deepEqual(created?.agentBindings?.map((item) => item.engine), ['codex', 'claude-code', 'opencode'])

    const listed = listPromptxCodexSessions(10)
    const listedProject = listed.find((item) => item.id === created?.id)
    assert.equal(Boolean(listedProject), true)
    assert.equal(listedProject?.agentBindings?.length, 3)

    const updated = updatePromptxCodexSession(created.id, {
      engine: 'claude-code',
      agentEngines: ['claude-code', 'opencode'],
    })

    assert.equal(updated?.engine, 'claude-code')
    assert.deepEqual(updated?.agentBindings?.map((item) => item.engine), ['claude-code', 'opencode'])

    const fetched = getPromptxCodexSessionById(created.id)
    assert.equal(fetched?.started, false)
    assert.deepEqual(fetched?.agentBindings?.map((item) => item.engine), ['claude-code', 'opencode'])
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})

test('重置和删除项目时会同步处理 hidden member sessions', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-reset-delete-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDir = path.join(tempDir, 'workspace')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const suffix = `test=${Date.now()}`
    const {
      createPromptxCodexSession,
      deletePromptxCodexSession,
      getPromptxCodexSessionById,
      resetPromptxCodexSession,
      updatePromptxCodexSession,
    } = await import(`./codexSessions.js?${suffix}`)
    const { all } = await import(`./db.js?${suffix}`)

    const created = createPromptxCodexSession({
      title: 'Reset Delete Project',
      cwd: workspaceDir,
      engine: 'codex',
      agentEngines: ['codex', 'claude-code', 'opencode'],
    })

    const bindingIds = new Map(created.agentBindings.map((item) => [item.engine, item.sessionRecordId]))

    updatePromptxCodexSession(created.id, {
      codexThreadId: 'root-thread',
      engineThreadId: 'root-thread',
    })
    updatePromptxCodexSession(bindingIds.get('claude-code'), {
      engineSessionId: 'claude-session',
      engineThreadId: 'claude-session',
    })
    updatePromptxCodexSession(bindingIds.get('opencode'), {
      engineSessionId: 'opencode-session',
      engineThreadId: 'opencode-session',
    })

    const resetProject = resetPromptxCodexSession(created.id)
    assert.equal(resetProject?.started, false)
    assert.deepEqual(
      resetProject?.agentBindings?.map((item) => ({
        engine: item.engine,
        sessionId: item.sessionId,
        started: item.started,
      })),
      [
        { engine: 'codex', sessionId: '', started: false },
        { engine: 'claude-code', sessionId: '', started: false },
        { engine: 'opencode', sessionId: '', started: false },
      ]
    )

    assert.equal(getPromptxCodexSessionById(created.id)?.sessionId, '')
    assert.equal(getPromptxCodexSessionById(bindingIds.get('claude-code'))?.sessionId, '')
    assert.equal(getPromptxCodexSessionById(bindingIds.get('opencode'))?.sessionId, '')
    assert.equal(getPromptxCodexSessionById(bindingIds.get('claude-code'))?.engineMeta?.hidden, true)
    assert.equal(getPromptxCodexSessionById(bindingIds.get('opencode'))?.engineMeta?.projectRootId, created.id)

    deletePromptxCodexSession(created.id)

    assert.equal(getPromptxCodexSessionById(created.id), null)
    assert.equal(getPromptxCodexSessionById(bindingIds.get('claude-code')), null)
    assert.equal(getPromptxCodexSessionById(bindingIds.get('opencode')), null)
    assert.equal(all('SELECT id FROM codex_sessions').length, 0)
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})

test('更新项目 agentEngines 会增删 hidden member sessions', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-members-update-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDir = path.join(tempDir, 'workspace')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const suffix = `test=${Date.now()}`
    const {
      createPromptxCodexSession,
      getPromptxCodexSessionById,
      updatePromptxCodexSession,
    } = await import(`./codexSessions.js?${suffix}`)

    const created = createPromptxCodexSession({
      title: 'Member Update Project',
      cwd: workspaceDir,
      engine: 'codex',
      agentEngines: ['codex', 'claude-code'],
    })

    const initialClaudeId = created.agentBindings.find((item) => item.engine === 'claude-code')?.sessionRecordId
    assert.ok(initialClaudeId)
    assert.equal(getPromptxCodexSessionById(initialClaudeId)?.engineMeta?.hidden, true)

    const updated = updatePromptxCodexSession(created.id, {
      agentEngines: ['codex', 'opencode'],
    })

    const nextBindings = updated?.agentBindings || []
    assert.deepEqual(nextBindings.map((item) => item.engine), ['codex', 'opencode'])
    assert.equal(getPromptxCodexSessionById(initialClaudeId), null)

    const openCodeId = nextBindings.find((item) => item.engine === 'opencode')?.sessionRecordId
    assert.ok(openCodeId)
    assert.equal(getPromptxCodexSessionById(openCodeId)?.engineMeta?.projectRootId, created.id)
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})

test('单 agent 项目会自动补默认 agentBindings', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-codex-sessions-legacy-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')
  const workspaceDir = path.join(tempDir, 'workspace')

  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(workspaceDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const {
      createPromptxCodexSession,
      getPromptxCodexSessionById,
      listPromptxCodexSessions,
    } = await import(`./codexSessions.js?test=${Date.now()}`)

    const created = createPromptxCodexSession({
      title: 'Single Agent Project',
      cwd: workspaceDir,
      engine: 'codex',
    })

    const listed = listPromptxCodexSessions(20).find((item) => item.id === created.id)
    assert.equal(Boolean(listed), true)
    assert.deepEqual(listed?.agentBindings, [{
      engine: 'codex',
      sessionRecordId: created.id,
      sessionId: '',
      started: false,
      running: false,
      isDefault: true,
    }])

    const fetched = getPromptxCodexSessionById(created.id)
    assert.deepEqual(fetched?.agentBindings, listed?.agentBindings)
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})
