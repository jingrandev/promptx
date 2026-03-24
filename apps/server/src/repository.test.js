import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('listTasks uses stable created-at order instead of updated-at order', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-repository-'))
  const originalCwd = process.cwd()
  const originalDataDir = process.env.PROMPTX_DATA_DIR
  const dataDir = path.join(tempDir, 'data')

  fs.mkdirSync(dataDir, { recursive: true })
  process.chdir(tempDir)
  process.env.PROMPTX_DATA_DIR = dataDir

  try {
    const repository = await import(`./repository.js?test=${Date.now()}`)
    const { createTask, listTasks, updateTask } = repository

    const olderTask = createTask({
      title: 'older',
      visibility: 'private',
      expiry: 'none',
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    const newerTask = createTask({
      title: 'newer',
      visibility: 'private',
      expiry: 'none',
    })

    updateTask(olderTask.slug, {
      title: 'older updated',
      visibility: 'private',
      expiry: 'none',
      blocks: [{ type: 'text', content: 'changed' }],
    })

    const items = listTasks()
    assert.deepEqual(
      items.map((item) => item.slug),
      [newerTask.slug, olderTask.slug]
    )
  } finally {
    process.chdir(originalCwd)
    if (typeof originalDataDir === 'string') {
      process.env.PROMPTX_DATA_DIR = originalDataDir
    } else {
      delete process.env.PROMPTX_DATA_DIR
    }
  }
})
