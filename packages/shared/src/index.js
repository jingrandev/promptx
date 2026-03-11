export const EXPIRY_PRESETS = {
  '24h': {
    label: '24 小时',
    hours: 24,
  },
}

export const EXPIRY_OPTIONS = Object.entries(EXPIRY_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label,
}))

export const VISIBILITY_OPTIONS = [
  { value: 'listed', label: '公开列表' },
]

export const BLOCK_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  IMPORTED_TEXT: 'imported_text',
}

export const BLOCK_TYPE_LABELS = {
  [BLOCK_TYPES.TEXT]: '文本',
  [BLOCK_TYPES.IMAGE]: '图片',
  [BLOCK_TYPES.IMPORTED_TEXT]: '导入文档',
}

export function normalizeVisibility(value) {
  return 'listed'
}

export function normalizeExpiry(value) {
  return '24h'
}

export function getVisibilityLabel(value) {
  return VISIBILITY_OPTIONS.find((item) => item.value === value)?.label || '公开列表'
}

export function getBlockTypeLabel(value) {
  return BLOCK_TYPE_LABELS[value] || '内容'
}

export function resolveExpiresAt(expiry = '24h', now = new Date()) {
  const preset = EXPIRY_PRESETS[normalizeExpiry(expiry)]
  if (!preset || preset.hours === null) {
    return null
  }

  return new Date(now.getTime() + preset.hours * 60 * 60 * 1000).toISOString()
}

export function getExpiryValue(expiresAt, now = new Date()) {
  if (!expiresAt) {
    return '24h'
  }

  const diffMs = new Date(expiresAt).getTime() - now.getTime()
  if (diffMs <= 24 * 60 * 60 * 1000 + 60 * 1000) {
    return '24h'
  }
  return '24h'
}

export function clampText(value = '', max = 20000) {
  return String(value).slice(0, max)
}

export function slugifyTitle(title = '') {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)

  return base || 'doc'
}

export function deriveTitleFromBlocks(blocks = [], max = 10) {
  const firstText = blocks.find(
    (block) =>
      (block.type === BLOCK_TYPES.TEXT || block.type === BLOCK_TYPES.IMPORTED_TEXT) &&
      block.content?.trim()
  )
  if (!firstText) {
    return ''
  }

  return firstText.content.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildRawText(document) {
  const parts = []
  if (document.title) {
    parts.push(`标题：${document.title}`, '')
  }

  for (const [index, block] of (document.blocks || []).entries()) {
    if (block.type === BLOCK_TYPES.TEXT || block.type === BLOCK_TYPES.IMPORTED_TEXT) {
      parts.push(block.content?.trim() || '', '')
      continue
    }

    if (block.type === BLOCK_TYPES.IMAGE) {
      parts.push(`图片 ${index + 1}：`, block.content || '')
      parts.push('')
    }
  }

  return parts.join('\n').trim() + '\n'
}

export function summarizeDocument(document) {
  const textBlock = (document.blocks || []).find(
    (block) =>
      (block.type === BLOCK_TYPES.TEXT || block.type === BLOCK_TYPES.IMPORTED_TEXT) &&
      block.content?.trim()
  )
  return (textBlock?.content || '').replace(/\s+/g, ' ').trim().slice(0, 180)
}
