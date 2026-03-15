import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
const dataDir = path.resolve(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'promptx.sqlite')

fs.mkdirSync(dataDir, { recursive: true })

const SQL = await initSqlJs({
  locateFile: () => wasmPath,
})

const db = fs.existsSync(dbPath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  : new SQL.Database()

db.run('PRAGMA foreign_keys = ON;')

function tableExists(name) {
  return Boolean(get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]))
}

function columnExists(tableName, columnName) {
  try {
    return all(`PRAGMA table_info(${tableName})`).some((row) => row.name === columnName)
  } catch {
    return false
  }
}

function resetLegacyTaskSchemaIfNeeded() {
  const hasLegacyDocumentsTable = tableExists('documents')
  const hasLegacyBlockColumn = tableExists('blocks') && !columnExists('blocks', 'task_id')
  const hasLegacyTaskColumns = tableExists('tasks') && !columnExists('tasks', 'auto_title')

  if (!hasLegacyDocumentsTable && !hasLegacyBlockColumn && !hasLegacyTaskColumns) {
    return
  }

  db.run(`
    DROP TABLE IF EXISTS blocks;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS documents;
  `)
}

function ensureSchema() {
  resetLegacyTaskSchemaIfNeeded()

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      edit_token TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      auto_title TEXT NOT NULL DEFAULT '',
      last_prompt_preview TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON tasks(visibility, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_blocks_task_sort ON blocks(task_id, sort_order ASC);

    CREATE TABLE IF NOT EXISTS codex_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT NOT NULL,
      codex_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_codex_sessions_updated_at ON codex_sessions(updated_at DESC);
  `)

  try {
    db.run(`ALTER TABLE tasks ADD COLUMN auto_title TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists.
  }

  try {
    db.run(`ALTER TABLE tasks ADD COLUMN last_prompt_preview TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists.
  }

  db.run(`
    DELETE FROM blocks
    WHERE task_id NOT IN (SELECT id FROM tasks);
  `)
}

ensureSchema()
persist()

export function persist() {
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  db.run('PRAGMA foreign_keys = ON;')
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql, params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null
}

export function run(sql, params = []) {
  db.run(sql, params)
}

export function transaction(callback) {
  try {
    db.run('BEGIN')
    const result = callback()
    db.run('COMMIT')
    persist()
    return result
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}
