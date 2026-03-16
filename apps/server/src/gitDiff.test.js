import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

function git(cwd, args = []) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

test('git diff review returns task and run scoped file changes for git workspaces', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-git-diff-'))
  const repoDir = path.join(tempDir, 'repo')
  fs.mkdirSync(repoDir, { recursive: true })

  git(repoDir, ['init'])
  git(repoDir, ['config', 'user.email', 'promptx@example.com'])
  git(repoDir, ['config', 'user.name', 'PromptX'])

  fs.writeFileSync(path.join(repoDir, 'tracked.txt'), 'base\n')
  git(repoDir, ['add', 'tracked.txt'])
  git(repoDir, ['commit', '-m', 'init'])
  const branchName = git(repoDir, ['symbolic-ref', '--short', 'HEAD'])

  const originalCwd = process.cwd()
  process.chdir(tempDir)

  try {
    const { run } = await import('./db.js')
    const { captureRunGitBaseline, captureTaskGitBaseline, getTaskGitDiffReview } = await import(`./gitDiff.js?test=${Date.now()}`)

    const now = new Date().toISOString()
    run(
      `INSERT INTO tasks (slug, edit_token, title, auto_title, last_prompt_preview, codex_session_id, visibility, expires_at, created_at, updated_at)
       VALUES (?, ?, '', '', '', ?, 'private', NULL, ?, ?)`,
      ['task-1', 'token-1', 'session-1', now, now]
    )
    run(
      `INSERT INTO codex_sessions (id, title, cwd, codex_thread_id, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?)`,
      ['session-1', 'Repo Session', repoDir, now, now]
    )
    run(
      `INSERT INTO codex_runs (id, task_slug, session_id, prompt, status, response_message, error_message, created_at, updated_at, started_at, finished_at)
       VALUES (?, ?, ?, '', 'running', '', '', ?, ?, ?, NULL)`,
      ['run-1', 'task-1', 'session-1', now, now, now]
    )

    captureTaskGitBaseline('task-1', repoDir)
    captureRunGitBaseline('run-1', repoDir)

    fs.writeFileSync(path.join(repoDir, 'tracked.txt'), 'after\n')
    fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'hello\n')

    const taskDiff = getTaskGitDiffReview('task-1', { scope: 'task' })
    const runDiff = getTaskGitDiffReview('task-1', { scope: 'run', runId: 'run-1' })

    assert.equal(taskDiff.supported, true)
    assert.equal(taskDiff.branch, branchName)
    assert.equal(taskDiff.summary.fileCount, 2)
    assert.deepEqual(taskDiff.files.map((file) => `${file.status}:${file.path}`), ['A:new-file.txt', 'M:tracked.txt'])
    assert.match(taskDiff.files.find((file) => file.path === 'tracked.txt')?.patch || '', /after/)
    assert.match(taskDiff.files.find((file) => file.path === 'new-file.txt')?.patch || '', /hello/)

    assert.equal(runDiff.supported, true)
    assert.equal(runDiff.branch, branchName)
    assert.equal(runDiff.summary.fileCount, 2)
    assert.deepEqual(runDiff.files.map((file) => `${file.status}:${file.path}`), ['A:new-file.txt', 'M:tracked.txt'])
  } finally {
    process.chdir(originalCwd)
  }
})
