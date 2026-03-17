import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

function withEnv(overrides, fn) {
  const previous = new Map()

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (typeof value === 'undefined') {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (typeof value === 'undefined') {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

test('appPaths resolves storage under PROMPTX_HOME by default', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-home-'))

  await withEnv(
    {
      PROMPTX_HOME: tempHome,
      PROMPTX_DATA_DIR: undefined,
      PROMPTX_UPLOADS_DIR: undefined,
      PROMPTX_TMP_DIR: undefined,
    },
    async () => {
      const appPaths = await import(`./appPaths.js?test=${Date.now()}`)
      const resolved = appPaths.ensurePromptxStorageReady()

      assert.equal(resolved.promptxHomeDir, tempHome)
      assert.equal(resolved.dataDir, path.join(tempHome, 'data'))
      assert.equal(resolved.uploadsDir, path.join(tempHome, 'uploads'))
      assert.equal(resolved.tmpDir, path.join(tempHome, 'tmp'))
    }
  )
})
