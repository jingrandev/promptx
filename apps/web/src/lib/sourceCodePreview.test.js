import assert from 'node:assert/strict'
import test from 'node:test'

import {
  inferPreviewLanguageFromPath,
  renderHighlightedCodeLines,
  renderSourceCodePreview,
  resolvePreviewLanguage,
} from './sourceCodePreview.js'

test('renderHighlightedCodeLines falls back to plain text when diff threshold is exceeded', async () => {
  const lines = Array.from({ length: 3 }, (_, index) => `const value${index} = ${index}`)

  const rendered = await renderHighlightedCodeLines(lines, {
    language: 'typescript',
    maxHighlightLines: 2,
  })

  assert.deepEqual(rendered, [
    'const value0 = 0',
    'const value1 = 1',
    'const value2 = 2',
  ])
})

test('renderSourceCodePreview falls back to plain table rows when source threshold is exceeded', async () => {
  const rendered = await renderSourceCodePreview('const answer = 42\nconsole.log(answer)', {
    language: 'javascript',
    maxHighlightChars: 10,
  })

  assert.equal(rendered.lineCount, 2)
  assert.match(rendered.html, /source-code-view__gutter/)
  assert.match(rendered.html, /const answer = 42/)
  assert.doesNotMatch(rendered.html, /style="color:/)
})

test('source preview resolves shell and powershell aliases', () => {
  assert.equal(resolvePreviewLanguage('fish'), 'fish')
  assert.equal(resolvePreviewLanguage('ps1'), 'powershell')
  assert.equal(resolvePreviewLanguage('pwsh'), 'powershell')
  assert.equal(resolvePreviewLanguage('csh'), 'bash')
})

test('source preview infers language from script file extensions', () => {
  assert.equal(inferPreviewLanguageFromPath('scripts/hello.fish'), 'fish')
  assert.equal(inferPreviewLanguageFromPath('scripts/hello.ps1'), 'powershell')
  assert.equal(inferPreviewLanguageFromPath('scripts/hello.csh'), 'bash')
})
