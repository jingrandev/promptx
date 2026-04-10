import { BLOCK_TYPES } from '@promptx/shared'

export function hasImageBlocks(blocks = []) {
  return (blocks || []).some((block) => block.type === BLOCK_TYPES.IMAGE)
}

function resolveImageUrl(content = '', rawUrl = '') {
  const value = String(content || '').trim()
  if (!value) {
    return ''
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }

  try {
    return new URL(value, rawUrl).toString()
  } catch {
    return value
  }
}

function trimBoundaryBlankLines(value = '') {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n')

  while (lines.length && !String(lines[0] || '').trim()) {
    lines.shift()
  }

  while (lines.length && !String(lines[lines.length - 1] || '').trim()) {
    lines.pop()
  }

  return lines.join('\n')
}

function buildCodexTaskBody(task, rawTaskUrl) {
  const parts = []

  for (const [index, block] of (task?.blocks || []).entries()) {
    if (block.type === BLOCK_TYPES.TEXT || block.type === BLOCK_TYPES.IMPORTED_TEXT) {
      const text = trimBoundaryBlankLines(block.content)
      if (text) {
        parts.push(text, '')
      }
      continue
    }

    if (block.type === BLOCK_TYPES.IMAGE) {
      const imageUrl = resolveImageUrl(block.content, rawTaskUrl)
      if (imageUrl) {
        parts.push(imageUrl, '')
      }
    }
  }

  return parts.join('\n').trim()
}

export function buildCodexPrompt(task, rawTaskUrl) {
  return buildCodexTaskBody(task, rawTaskUrl)
}
