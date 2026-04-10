let highlighterPromise = null

export const DIFF_HIGHLIGHT_LIMITS = {
  maxLines: 2000,
  maxChars: 200000,
}

export const SOURCE_PREVIEW_HIGHLIGHT_LIMITS = {
  maxLines: 2000,
  maxChars: 200000,
}

const themeLoaders = {
  'github-dark-default': () => import('shiki/dist/themes/github-dark-default.mjs').then((module) => module.default),
  'github-light': () => import('shiki/dist/themes/github-light.mjs').then((module) => module.default),
}

const languageLoaders = {
  bash: () => import('shiki/dist/langs/bash.mjs').then((module) => module.default),
  c: () => import('shiki/dist/langs/c.mjs').then((module) => module.default),
  cpp: () => import('shiki/dist/langs/cpp.mjs').then((module) => module.default),
  css: () => import('shiki/dist/langs/css.mjs').then((module) => module.default),
  diff: () => import('shiki/dist/langs/diff.mjs').then((module) => module.default),
  dockerfile: () => import('shiki/dist/langs/dockerfile.mjs').then((module) => module.default),
  go: () => import('shiki/dist/langs/go.mjs').then((module) => module.default),
  html: () => import('shiki/dist/langs/html.mjs').then((module) => module.default),
  java: () => import('shiki/dist/langs/java.mjs').then((module) => module.default),
  javascript: () => import('shiki/dist/langs/javascript.mjs').then((module) => module.default),
  json: () => import('shiki/dist/langs/json.mjs').then((module) => module.default),
  markdown: () => import('shiki/dist/langs/markdown.mjs').then((module) => module.default),
  python: () => import('shiki/dist/langs/python.mjs').then((module) => module.default),
  rust: () => import('shiki/dist/langs/rust.mjs').then((module) => module.default),
  sql: () => import('shiki/dist/langs/sql.mjs').then((module) => module.default),
  tsx: () => import('shiki/dist/langs/tsx.mjs').then((module) => module.default),
  typescript: () => import('shiki/dist/langs/typescript.mjs').then((module) => module.default),
  vue: () => import('shiki/dist/langs/vue.mjs').then((module) => module.default),
  xml: () => import('shiki/dist/langs/xml.mjs').then((module) => module.default),
  yaml: () => import('shiki/dist/langs/yaml.mjs').then((module) => module.default),
}

function getGutterWidth(lineCount = 0) {
  return Number(lineCount) > 9999 ? '3.4rem' : '2.6rem'
}

export function getCodeGutterWidth(lineCount = 0) {
  return getGutterWidth(lineCount)
}

function getNormalizedLineMetrics(lines = []) {
  const normalizedLines = Array.isArray(lines) ? lines.map((line) => String(line ?? '')) : []
  const charCount = normalizedLines.reduce((total, line) => total + line.length, 0)

  return {
    lines: normalizedLines,
    lineCount: normalizedLines.length,
    charCount,
  }
}

function shouldUsePlainFallbackByThreshold(metrics = {}, options = {}) {
  const maxLines = Number(options.maxHighlightLines || 0)
  const maxChars = Number(options.maxHighlightChars || 0)

  if (maxLines > 0 && Number(metrics.lineCount || 0) > maxLines) {
    return true
  }

  if (maxChars > 0 && Number(metrics.charCount || 0) > maxChars) {
    return true
  }

  return false
}

export function exceedsHighlightThresholdForLines(lines = [], limits = {}) {
  const metrics = getNormalizedLineMetrics(lines)
  return shouldUsePlainFallbackByThreshold(metrics, {
    maxHighlightLines: limits.maxLines,
    maxHighlightChars: limits.maxChars,
  })
}

export function exceedsHighlightThresholdForCode(code = '', limits = {}) {
  const normalizedCode = String(code || '').replace(/\r\n/g, '\n')
  return exceedsHighlightThresholdForLines(normalizedCode ? normalizedCode.split('\n') : [], limits)
}

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('shiki/core'),
      import('shiki/dist/engine-javascript.mjs'),
    ]).then(async ([coreModule, engineModule]) => (
      coreModule.createHighlighterCore({
        engine: engineModule.createJavaScriptRegexEngine(),
        langs: [],
        themes: [],
      })
    ))
  }

  return highlighterPromise
}

async function ensureTheme(highlighter, theme) {
  if (!theme || highlighter.getLoadedThemes().includes(theme)) {
    return
  }

  const loader = themeLoaders[theme]
  if (!loader) {
    return
  }

  await highlighter.loadTheme(await loader())
}

async function ensureLanguage(highlighter, language) {
  if (!language || highlighter.getLoadedLanguages().includes(language)) {
    return
  }

  const loader = languageLoaders[language]
  if (!loader) {
    return
  }

  await highlighter.loadLanguage(await loader())
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const languageMap = {
  bash: 'bash',
  c: 'c',
  cpp: 'cpp',
  css: 'css',
  diff: 'diff',
  dockerfile: 'dockerfile',
  go: 'go',
  html: 'html',
  java: 'java',
  js: 'javascript',
  javascript: 'javascript',
  json: 'json',
  jsx: 'tsx',
  md: 'markdown',
  markdown: 'markdown',
  python: 'python',
  react: 'tsx',
  rust: 'rust',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  svg: 'html',
  text: '',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

export function resolvePreviewLanguage(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return ''
  }
  return languageMap[normalized] || normalized
}

export function inferPreviewLanguageFromPath(filePath = '', fallbackLanguage = '') {
  const fallback = resolvePreviewLanguage(fallbackLanguage)
  if (fallback) {
    return fallback
  }

  const normalizedPath = String(filePath || '').trim().toLowerCase()
  if (!normalizedPath) {
    return ''
  }

  const fileName = normalizedPath.split('/').pop() || ''
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : ''

  const extensionMap = {
    '.c': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.css': 'css',
    '.diff': 'diff',
    '.go': 'go',
    '.htm': 'html',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'tsx',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.sh': 'bash',
    '.sql': 'sql',
    '.svg': 'html',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.vue': 'vue',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  }

  if (fileName === 'dockerfile') {
    return 'dockerfile'
  }

  return extensionMap[extension] || ''
}

function renderToken(token) {
  const styles = []
  if (token?.color) {
    styles.push(`color:${token.color}`)
  }
  if (token?.fontStyle & 1) {
    styles.push('font-style:italic')
  }
  if (token?.fontStyle & 2) {
    styles.push('font-weight:600')
  }
  if (token?.fontStyle & 4) {
    styles.push('text-decoration:underline')
  }

  const content = escapeHtml(token?.content || '')
  return `<span${styles.length ? ` style="${styles.join(';')}"` : ''}>${content}</span>`
}

function renderLines(lines = [], options = {}) {
  const startLine = Math.max(1, Number(options.startLine) || 1)
  return {
    html: lines.map((line, index) => (
      `<tr class="source-code-view__line">`
      + `<td class="source-code-view__gutter" data-line="${startLine + index}">${startLine + index}</td>`
      + `<td class="source-code-view__code"><span class="source-code-view__line-inner">${line}</span></td>`
      + `</tr>`
    )).join(''),
    lineCount: lines.length,
    bg: options.bg || '',
    fg: options.fg || '',
    gutterWidth: getGutterWidth(lines.length),
  }
}

export function renderPlainCodeLines(lines = []) {
  const normalizedLines = Array.isArray(lines) ? lines.map((line) => String(line ?? '')) : []
  return normalizedLines.map((line) => line ? escapeHtml(line) : '&#8203;')
}

function renderPlainLines(code = '') {
  const normalizedCode = String(code || '').replace(/\r\n/g, '\n')
  return renderLines(
    normalizedCode.split('\n').map((line) => line ? escapeHtml(line) : '&#8203;'),
    {}
  )
}

export async function renderHighlightedCodeLines(lines = [], options = {}) {
  const metrics = getNormalizedLineMetrics(lines)
  const normalizedLines = metrics.lines
  const theme = options.isDark ? 'github-dark-default' : 'github-light'
  const language = resolvePreviewLanguage(options.language)

  if (!normalizedLines.length) {
    return []
  }

  if (shouldUsePlainFallbackByThreshold(metrics, options)) {
    return normalizedLines.map((line) => line ? escapeHtml(line) : '&#8203;')
  }

  if (!language) {
    return normalizedLines.map((line) => line ? escapeHtml(line) : '&#8203;')
  }

  try {
    const highlighter = await getHighlighter()
    await ensureTheme(highlighter, theme)
    await ensureLanguage(highlighter, language)

    const result = await highlighter.codeToTokens(normalizedLines.join('\n'), {
      lang: language,
      theme,
    })

    return result.tokens.map((lineTokens) => (
      lineTokens.length
        ? lineTokens.map(renderToken).join('')
        : '&#8203;'
    ))
  } catch {
    return normalizedLines.map((line) => line ? escapeHtml(line) : '&#8203;')
  }
}

export async function renderSourceCodePreview(code = '', options = {}) {
  const normalizedCode = String(code || '').replace(/\r\n/g, '\n')
  const theme = options.isDark ? 'github-dark-default' : 'github-light'
  const language = resolvePreviewLanguage(options.language)
  const lines = normalizedCode ? normalizedCode.split('\n') : []
  const metrics = getNormalizedLineMetrics(lines)

  if (!normalizedCode) {
    return {
      html: '',
      lineCount: 0,
      bg: '',
      fg: '',
      gutterWidth: getGutterWidth(0),
    }
  }

  if (shouldUsePlainFallbackByThreshold(metrics, options)) {
    return renderPlainLines(normalizedCode)
  }

  if (!language) {
    return renderPlainLines(normalizedCode)
  }

  try {
    const highlighter = await getHighlighter()
    await ensureTheme(highlighter, theme)
    await ensureLanguage(highlighter, language)

    const result = await highlighter.codeToTokens(normalizedCode, {
      lang: language,
      theme,
    })

    return renderLines(
      result.tokens.map((lineTokens) => (
        lineTokens.length
          ? lineTokens.map(renderToken).join('')
          : '&#8203;'
      )),
      {
        bg: result.bg || '',
        fg: result.fg || '',
      }
    )
  } catch {
    return renderPlainLines(normalizedCode)
  }
}
