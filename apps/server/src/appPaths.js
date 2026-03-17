import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultPromptxHomeDir = path.join(os.homedir(), '.promptx')

let preparedStorageKey = ''

function directoryHasEntries(targetPath = '') {
  try {
    return fs.readdirSync(targetPath).length > 0
  } catch {
    return false
  }
}

function moveDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || !directoryHasEntries(sourceDir)) {
    return false
  }

  if (fs.existsSync(targetDir) && directoryHasEntries(targetDir)) {
    return false
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })

  try {
    fs.renameSync(sourceDir, targetDir)
    return true
  } catch (error) {
    if (error?.code !== 'EXDEV') {
      throw error
    }
  }

  fs.mkdirSync(targetDir, { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
  fs.rmSync(sourceDir, { recursive: true, force: true })
  return true
}

function resolvePromptxPaths() {
  const promptxHomeDir = process.env.PROMPTX_HOME
    ? path.resolve(process.env.PROMPTX_HOME)
    : defaultPromptxHomeDir

  const dataDir = process.env.PROMPTX_DATA_DIR
    ? path.resolve(process.env.PROMPTX_DATA_DIR)
    : path.join(promptxHomeDir, 'data')

  const uploadsDir = process.env.PROMPTX_UPLOADS_DIR
    ? path.resolve(process.env.PROMPTX_UPLOADS_DIR)
    : path.join(promptxHomeDir, 'uploads')

  const tmpDir = process.env.PROMPTX_TMP_DIR
    ? path.resolve(process.env.PROMPTX_TMP_DIR)
    : path.join(promptxHomeDir, 'tmp')

  return { promptxHomeDir, dataDir, uploadsDir, tmpDir }
}

export function ensurePromptxStorageReady() {
  const resolved = resolvePromptxPaths()
  const storageKey = JSON.stringify(resolved)

  if (preparedStorageKey === storageKey) {
    return resolved
  }

  fs.mkdirSync(resolved.promptxHomeDir, { recursive: true })

  const migrationPlans = [
    process.env.PROMPTX_DATA_DIR
      ? null
      : { source: path.join(serverRootDir, 'data'), target: resolved.dataDir },
    process.env.PROMPTX_UPLOADS_DIR
      ? null
      : { source: path.join(serverRootDir, 'uploads'), target: resolved.uploadsDir },
    process.env.PROMPTX_TMP_DIR
      ? null
      : { source: path.join(serverRootDir, 'tmp'), target: resolved.tmpDir },
  ].filter(Boolean)

  migrationPlans.forEach(({ source, target }) => {
    moveDirectoryContents(source, target)
  })

  fs.mkdirSync(resolved.dataDir, { recursive: true })
  fs.mkdirSync(resolved.uploadsDir, { recursive: true })
  fs.mkdirSync(resolved.tmpDir, { recursive: true })

  preparedStorageKey = storageKey
  return resolved
}

export {
  serverRootDir,
  resolvePromptxPaths,
}
