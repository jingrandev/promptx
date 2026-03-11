import { customAlphabet } from 'nanoid'
import {
  BLOCK_TYPES,
  buildRawText,
  clampText,
  deriveTitleFromBlocks,
  getExpiryValue,
  normalizeExpiry,
  normalizeVisibility,
  resolveExpiresAt,
  slugifyTitle,
  summarizeDocument,
} from '@tmpprompt/shared'
import { all, get, persist, run, transaction } from './db.js'

const slugTail = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 6)
const tokenId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 20)

function toBlock(row) {
  return {
    id: Number(row.id),
    type: row.type,
    content: row.content,
    sortOrder: Number(row.sort_order),
    meta: JSON.parse(row.meta_json || '{}'),
  }
}

function toDocument(row, blocks = []) {
  const displayTitle = row.title || deriveTitleFromBlocks(blocks)
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    displayTitle,
    visibility: row.visibility,
    expiresAt: row.expires_at,
    expiry: getExpiryValue(row.expires_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blocks,
  }
}

function ensureSlug(title) {
  const base = slugifyTitle(title)
  let slug = `${base}-${slugTail()}`
  while (get('SELECT 1 FROM documents WHERE slug = ?', [slug])) {
    slug = `${base}-${slugTail()}`
  }
  return slug
}

function isExpired(document) {
  return Boolean(document.expiresAt && new Date(document.expiresAt).getTime() <= Date.now())
}

function loadBlocks(documentId) {
  return all(
    `SELECT id, type, content, sort_order, meta_json
     FROM blocks
     WHERE document_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [documentId]
  ).map(toBlock)
}

export function listDocuments(limit = 30) {
  const rows = all(
    `SELECT id, slug, title, visibility, expires_at, created_at, updated_at
     FROM documents
     WHERE visibility = 'listed'
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  )

  return rows
    .map((row) => {
      const document = toDocument(row, loadBlocks(row.id))
      if (isExpired(document)) {
        return null
      }

      return {
        slug: document.slug,
        title: document.displayTitle || '未命名文档',
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        visibility: document.visibility,
        expiresAt: document.expiresAt,
        preview: summarizeDocument(document),
        blockCount: document.blocks.length,
      }
    })
    .filter(Boolean)
}

export function getDocumentBySlug(slug) {
  const row = get(
    `SELECT id, slug, title, visibility, expires_at, created_at, updated_at
     FROM documents
     WHERE slug = ?`,
    [slug]
  )

  if (!row) {
    return null
  }

  const document = toDocument(row, loadBlocks(row.id))
  return isExpired(document) ? { ...document, expired: true } : document
}

export function createDocument(input = {}) {
  const now = new Date().toISOString()
  const title = clampText(input.title || '', 140)
  const visibility = normalizeVisibility(input.visibility)
  const expiresAt = resolveExpiresAt(normalizeExpiry(input.expiry || '24h'))
  const slug = ensureSlug(title)
  const editToken = tokenId()

  transaction(() => {
    run(
      `INSERT INTO documents (slug, edit_token, title, visibility, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, editToken, title, visibility, expiresAt, now, now]
    )
  })

  return {
    ...getDocumentBySlug(slug),
    editToken,
  }
}

export function updateDocument(slug, input = {}) {
  const existing = get('SELECT id, edit_token FROM documents WHERE slug = ?', [slug])
  if (!existing) {
    return { error: 'not_found' }
  }
  if (existing.edit_token !== input.editToken) {
    return { error: 'forbidden' }
  }

  const title = clampText(input.title || '', 140)
  const visibility = normalizeVisibility(input.visibility)
  const expiresAt = resolveExpiresAt(normalizeExpiry(input.expiry || '24h'))
  const updatedAt = new Date().toISOString()
  const blocks = Array.isArray(input.blocks) ? input.blocks : []

  transaction(() => {
    run(
      `UPDATE documents
       SET title = ?, visibility = ?, expires_at = ?, updated_at = ?
       WHERE slug = ?`,
      [title, visibility, expiresAt, updatedAt, slug]
    )

    run('DELETE FROM blocks WHERE document_id = ?', [existing.id])

    blocks.forEach((block, index) => {
      const type =
        block.type === BLOCK_TYPES.IMAGE
          ? BLOCK_TYPES.IMAGE
          : block.type === BLOCK_TYPES.IMPORTED_TEXT
            ? BLOCK_TYPES.IMPORTED_TEXT
            : BLOCK_TYPES.TEXT
      const content = clampText(
        block.content || '',
        type === BLOCK_TYPES.IMAGE ? 1000 : 50000
      )
      const meta =
        type === BLOCK_TYPES.IMPORTED_TEXT
          ? {
              fileName: clampText(block.meta?.fileName || '', 180),
              collapsed: Boolean(block.meta?.collapsed),
            }
          : {}
      run(
        `INSERT INTO blocks (document_id, type, content, sort_order, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [existing.id, type, content, index, JSON.stringify(meta), updatedAt]
      )
    })
  })

  return getDocumentBySlug(slug)
}

export function deleteDocument(slug, editToken) {
  const row = get('SELECT id, edit_token FROM documents WHERE slug = ?', [slug])
  if (!row) {
    return { error: 'not_found' }
  }
  if (row.edit_token !== editToken) {
    return { error: 'forbidden' }
  }

  transaction(() => {
    run('DELETE FROM documents WHERE slug = ?', [slug])
  })
  return { ok: true }
}

export function buildDocumentExports(document) {
  return {
    raw: buildRawText(document),
  }
}

export function canEditDocument(slug, editToken) {
  if (!editToken) {
    return false
  }
  return Boolean(get('SELECT 1 FROM documents WHERE slug = ? AND edit_token = ?', [slug, editToken]))
}
