function normalizeText(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').trim()
}

function limitItems(items = [], max = 12) {
  const list = Array.isArray(items) ? items : []
  if (list.length <= max) {
    return { items: list, hiddenCount: 0 }
  }

  return {
    items: list.slice(0, max),
    hiddenCount: list.length - max,
  }
}

function parseHeaderMeta(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) {
    return null
  }

  const lines = normalized.split('\n')
  const firstLine = String(lines[0] || '').trim()
  if (!firstLine) {
    return null
  }

  const matched = firstLine.match(/^([A-Za-z][A-Za-z0-9 _/-]{1,24}):\s*(.+)$/)
  if (!matched) {
    return null
  }

  const rest = lines.slice(1).join('\n').trim()
  return {
    meta: {
      type: 'meta',
      items: [
        {
          label: matched[1].trim(),
          value: matched[2].trim(),
        },
      ],
    },
    rest,
  }
}

function parseXmlDirectoryBlock(text = '', options = {}) {
  const normalized = normalizeText(text)
  if (!normalized.includes('<path>') || !normalized.includes('<entries>')) {
    return null
  }

  const pathMatch = normalized.match(/<path>([\s\S]*?)<\/path>/i)
  const typeMatch = normalized.match(/<type>([\s\S]*?)<\/type>/i)
  const entriesMatch = normalized.match(/<entries>([\s\S]*?)<\/entries>/i)

  if (!pathMatch && !entriesMatch) {
    return null
  }

  const rawEntries = String(entriesMatch?.[1] || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\(\d+\s+entries?\)$/i.test(line))

  const { items, hiddenCount } = limitItems(rawEntries, options.maxItems ?? 12)
  return {
    type: 'directory_list',
    path: String(pathMatch?.[1] || '').trim(),
    entryType: String(typeMatch?.[1] || '').trim(),
    entries: items,
    totalCount: rawEntries.length,
    hiddenCount,
  }
}

function parseChecklistBlock(text = '', options = {}) {
  const lines = normalizeText(text).split('\n').map((line) => line.trimEnd())
  const parsed = lines
    .map((line) => {
      const matched = line.match(/^\s*\[([ xX])\]\s+(.+)$/)
      if (!matched) {
        return null
      }

      return {
        completed: matched[1].toLowerCase() === 'x',
        text: matched[2].trim(),
      }
    })
    .filter(Boolean)

  if (!parsed.length || parsed.length < Math.ceil(lines.filter(Boolean).length * 0.6)) {
    return null
  }

  const { items, hiddenCount } = limitItems(parsed, options.maxItems ?? 12)
  return {
    type: 'checklist',
    items,
    totalCount: parsed.length,
    hiddenCount,
  }
}

function parseCodeSnippetBlock(text = '', options = {}) {
  const lines = normalizeText(text).split('\n')
  const parsed = lines
    .map((line) => {
      const matched = line.match(/^(\d+)\s*:\s?(.*)$/)
      if (!matched) {
        return null
      }

      return {
        number: matched[1],
        content: matched[2] || '',
      }
    })
    .filter(Boolean)

  if (parsed.length < 2 || parsed.length < Math.ceil(lines.filter(Boolean).length * 0.6)) {
    return null
  }

  const { items, hiddenCount } = limitItems(parsed, options.maxItems ?? 12)
  return {
    type: 'code_snippet',
    lines: items,
    totalCount: parsed.length,
    hiddenCount,
  }
}

function parseNumberedLinesBlock(text = '', options = {}) {
  const lines = normalizeText(text).split('\n')
  const parsed = lines
    .map((line) => {
      const matched = line.match(/^(\d+)\s*[-.)]\s*(.*)$/)
      if (!matched) {
        return null
      }

      return {
        number: matched[1],
        content: matched[2] || '',
      }
    })
    .filter(Boolean)

  if (parsed.length < 3 || parsed.length < Math.ceil(lines.filter(Boolean).length * 0.6)) {
    return null
  }

  const { items, hiddenCount } = limitItems(parsed, options.maxItems ?? 15)
  return {
    type: 'numbered_lines',
    items,
    totalCount: parsed.length,
    hiddenCount,
  }
}

function parseBulletListBlock(text = '', options = {}) {
  const lines = normalizeText(text).split('\n')
  const parsed = lines
    .map((line) => {
      const matched = line.match(/^[-*]\s+(.+)$/)
      return matched ? matched[1].trim() : null
    })
    .filter(Boolean)

  if (parsed.length < 2 || parsed.length < Math.ceil(lines.filter(Boolean).length * 0.6)) {
    return null
  }

  const { items, hiddenCount } = limitItems(parsed, options.maxItems ?? 12)
  return {
    type: 'bullet_list',
    items,
    totalCount: parsed.length,
    hiddenCount,
  }
}

function shouldPreferMarkdown(text = '') {
  return /```|^\s*#{1,4}\s+|^\s*>\s+/m.test(text)
}

export function parseProcessDetailTextBlocks(value = '', options = {}) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return []
  }

  const header = parseHeaderMeta(normalized)
  if (header?.rest) {
    const innerBlocks = parseProcessDetailTextBlocks(header.rest, options)
    return [header.meta, ...(innerBlocks.length ? innerBlocks : [{ type: 'text', text: header.rest }])]
  }

  const directoryBlock = parseXmlDirectoryBlock(normalized, options)
  if (directoryBlock) {
    return [directoryBlock]
  }

  const checklistBlock = parseChecklistBlock(normalized, options)
  if (checklistBlock) {
    return [checklistBlock]
  }

  const codeSnippetBlock = parseCodeSnippetBlock(normalized, options)
  if (codeSnippetBlock) {
    return [codeSnippetBlock]
  }

  const numberedLinesBlock = parseNumberedLinesBlock(normalized, options)
  if (numberedLinesBlock) {
    return [numberedLinesBlock]
  }

  const bulletListBlock = parseBulletListBlock(normalized, options)
  if (bulletListBlock) {
    return [bulletListBlock]
  }

  return [{
    type: shouldPreferMarkdown(normalized) || options.preferMarkdown ? 'markdown' : 'text',
    text: normalized,
  }]
}
