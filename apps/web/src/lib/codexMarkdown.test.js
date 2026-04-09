import assert from 'node:assert/strict'
import test from 'node:test'

import { renderCodexMarkdown, renderPlainCodexMarkdown } from './codexMarkdown.js'

test('renderCodexMarkdown renders fenced code blocks and lists', () => {
  const html = renderCodexMarkdown([
    '# 标题',
    '',
    '- 一',
    '- 二',
    '',
    '```js',
    'console.log(1)',
    '```',
  ].join('\n'))

  assert.match(html, /<ul>/)
  assert.match(html, /class="codex-code-block codex-code-block--labeled"/)
  assert.match(html, /class="codex-code-block__language">JavaScript</)
  assert.match(html, /<pre class="hljs"><code class="hljs language-js">/)
  assert.match(html, /hljs-variable[^>]*>console</)
  assert.match(html, /hljs-title function_[^>]*>log</)
  assert.match(html, /hljs-number[^>]*>1</)
})

test('renderCodexMarkdown renders react language badge', () => {
  const html = renderCodexMarkdown([
    '```react',
    'export default function Hello() {',
    '  return <div>Hello</div>',
    '}',
    '```',
  ].join('\n'))

  assert.match(html, /class="codex-code-block__language">React</)
  assert.match(html, /<pre class="hljs"><code class="hljs language-react">/)
})

test('renderPlainCodexMarkdown keeps fenced code plain', () => {
  const html = renderPlainCodexMarkdown([
    '```js',
    'console.log(1)',
    '```',
  ].join('\n'))

  assert.doesNotMatch(html, /codex-code-block/)
  assert.doesNotMatch(html, /hljs/)
  assert.match(html, /<pre><code class="language-js">/)
  assert.match(html, /console\.log\(1\)/)
})

test('renderCodexMarkdown escapes raw html and hardens links', () => {
  const html = renderCodexMarkdown('<script>alert(1)</script>\n\n[link](https://example.com)')

  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noreferrer noopener"/)
})
