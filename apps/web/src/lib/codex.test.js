import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCodexPrompt } from './codex.js'

test('buildCodexPrompt trims boundary blank lines from text blocks', () => {
  const prompt = buildCodexPrompt({
    blocks: [
      {
        type: 'text',
        content: '\n\n第一行\n第二行\n\n',
      },
      {
        type: 'imported_text',
        content: '\n\n```js\nconsole.log(1)\n```\n\n',
      },
    ],
  })

  assert.equal(prompt, '第一行\n第二行\n\n```js\nconsole.log(1)\n```')
})
