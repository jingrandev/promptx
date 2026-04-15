const SHELL_MODE = 'shell'
const SHELL_PREFIXES = new Set(['!', '！'])
const TEXT_BLOCK_TYPE = 'text'

function normalizeText(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').trim()
}

function startsWithShellPrefix(value = '') {
  const text = String(value || '')
  return SHELL_PREFIXES.has(text.charAt(0))
}

export function isShellCommandPrompt(value = '') {
  return startsWithShellPrefix(normalizeText(value))
}

export function normalizeShellPromptPrefix(value = '') {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  return text.charAt(0) === '！'
    ? `!${text.slice(1)}`
    : text
}

export function extractShellCommandIntent(input = {}) {
  const promptBlocks = Array.isArray(input?.promptBlocks) ? input.promptBlocks : []
  const meaningfulBlocks = promptBlocks.filter((block) => Boolean(normalizeText(block?.content)))
  const hasPromptBlocks = meaningfulBlocks.length > 0

  const prompt = hasPromptBlocks
    ? meaningfulBlocks
      .filter((block) => String(block?.type || '').trim() === TEXT_BLOCK_TYPE)
      .map((block) => normalizeText(block?.content))
      .filter(Boolean)
      .join('\n\n')
      .trim()
    : normalizeText(input?.prompt)

  if (!startsWithShellPrefix(prompt)) {
    return {
      mode: '',
      prompt,
      command: '',
      reason: '',
    }
  }

  if (hasPromptBlocks) {
    const hasNonTextBlock = meaningfulBlocks.some((block) => String(block?.type || '').trim() !== TEXT_BLOCK_TYPE)
    if (hasNonTextBlock) {
      return {
        mode: '',
        prompt,
        command: '',
        reason: 'unsupported_blocks',
      }
    }
  }

  const normalizedPrompt = normalizeShellPromptPrefix(prompt)
  const command = normalizedPrompt.slice(1).trim()
  if (!command) {
    return {
      mode: '',
      prompt,
      command: '',
      reason: 'empty_command',
    }
  }

  return {
    mode: SHELL_MODE,
    prompt,
    command,
    reason: '',
  }
}
