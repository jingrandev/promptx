import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLanguage from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdownLanguage)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['js', 'jsx', 'react'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['html', 'vue', 'svg'], { languageName: 'xml' })

const AUTO_HIGHLIGHT_LANGUAGES = [
  'bash',
  'css',
  'diff',
  'java',
  'javascript',
  'json',
  'markdown',
  'python',
  'sql',
  'typescript',
  'xml',
]

const markdownUtils = new MarkdownIt()

function normalizeLanguage(value = '') {
  return String(value || '').trim().toLowerCase()
}

function escapeHtml(value = '') {
  return markdownUtils.utils.escapeHtml(String(value || ''))
}

function getDisplayLanguage(value = '') {
  const normalized = normalizeLanguage(value)

  if (!normalized) {
    return ''
  }

  if (['js', 'javascript'].includes(normalized)) {
    return 'JavaScript'
  }

  if (['jsx', 'react'].includes(normalized)) {
    return 'React'
  }

  if (['ts', 'typescript'].includes(normalized)) {
    return 'TypeScript'
  }

  if (normalized === 'tsx') {
    return 'TSX'
  }

  if (['sh', 'shell', 'zsh', 'bash'].includes(normalized)) {
    return 'Bash'
  }

  if (normalized === 'md') {
    return 'Markdown'
  }

  if (normalized === 'html') {
    return 'HTML'
  }

  if (normalized === 'vue') {
    return 'Vue'
  }

  if (normalized === 'svg') {
    return 'SVG'
  }

  if (normalized === 'json') {
    return 'JSON'
  }

  if (normalized === 'sql') {
    return 'SQL'
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function highlightCode(code = '', language = '') {
  const source = String(code || '')
  const requestedLanguage = normalizeLanguage(language)

  if (requestedLanguage && hljs.getLanguage(requestedLanguage)) {
    return hljs.highlight(source, { language: requestedLanguage, ignoreIllegals: true }).value
  }

  const autoResult = hljs.highlightAuto(source, AUTO_HIGHLIGHT_LANGUAGES)
  return autoResult.value || markdown.utils.escapeHtml(source)
}

function renderHighlightedFence(content = '', language = '') {
  const highlighted = highlightCode(content, language)
  const normalizedLanguage = normalizeLanguage(language)
  const languageClass = normalizedLanguage
    ? ` language-${normalizedLanguage}`
    : ''
  const languageLabel = getDisplayLanguage(language)
  const languageBadge = languageLabel
    ? `<div class="codex-code-block__header"><span class="codex-code-block__language">${escapeHtml(languageLabel)}</span></div>`
    : ''
  const blockClass = languageLabel
    ? 'codex-code-block codex-code-block--labeled'
    : 'codex-code-block'

  return `<div class="${blockClass}">${languageBadge}<pre class="hljs"><code class="hljs${languageClass}">${highlighted}</code></pre></div>`
}

function createMarkdownRenderer(options = {}) {
  const instance = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  })

  const defaultLinkOpenRule = instance.renderer.rules.link_open
  const defaultFenceRule = instance.renderer.rules.fence
  const defaultTableOpenRule = instance.renderer.rules.table_open
  const defaultTableCloseRule = instance.renderer.rules.table_close

  instance.renderer.rules.link_open = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx]
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noreferrer noopener')

    if (typeof defaultLinkOpenRule === 'function') {
      return defaultLinkOpenRule(tokens, idx, renderOptions, env, self)
    }

    return self.renderToken(tokens, idx, renderOptions)
  }

  if (options.highlightFences) {
    instance.renderer.rules.fence = (tokens, idx, renderOptions, env, self) => {
      const token = tokens[idx]
      const language = String(token?.info || '').trim().split(/\s+/)[0] || ''

      if (token?.content) {
        return renderHighlightedFence(token.content, language)
      }

      if (typeof defaultFenceRule === 'function') {
        return defaultFenceRule(tokens, idx, renderOptions, env, self)
      }

      return ''
    }
  }

  instance.renderer.rules.table_open = (tokens, idx, renderOptions, env, self) => {
    const rendered = typeof defaultTableOpenRule === 'function'
      ? defaultTableOpenRule(tokens, idx, renderOptions, env, self)
      : self.renderToken(tokens, idx, renderOptions)

    return `<div class="codex-table-wrap">${rendered}`
  }

  instance.renderer.rules.table_close = (tokens, idx, renderOptions, env, self) => {
    const rendered = typeof defaultTableCloseRule === 'function'
      ? defaultTableCloseRule(tokens, idx, renderOptions, env, self)
      : self.renderToken(tokens, idx, renderOptions)

    return `${rendered}</div>`
  }

  return instance
}

const markdown = createMarkdownRenderer({ highlightFences: true })
const plainMarkdown = createMarkdownRenderer()

export function renderCodexMarkdown(value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  return markdown.render(text)
}

export function renderPlainCodexMarkdown(value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  return plainMarkdown.render(text)
}
