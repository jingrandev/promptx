import assert from 'node:assert/strict'
import test from 'node:test'

import { extractShellCommandIntent, normalizeShellPromptPrefix } from './shellCommands.js'

test('extractShellCommandIntent 识别半角和全角 shell 前缀', () => {
  assert.deepEqual(
    extractShellCommandIntent({ prompt: '!pwd' }),
    {
      mode: 'shell',
      prompt: '!pwd',
      command: 'pwd',
      reason: '',
    }
  )

  assert.deepEqual(
    extractShellCommandIntent({ prompt: '！pwd' }),
    {
      mode: 'shell',
      prompt: '！pwd',
      command: 'pwd',
      reason: '',
    }
  )

  assert.equal(normalizeShellPromptPrefix('！git status'), '!git status')
})

test('extractShellCommandIntent 拒绝带图片的命令模式', () => {
  assert.deepEqual(
    extractShellCommandIntent({
      promptBlocks: [
        { type: 'text', content: '!pwd' },
        { type: 'image', content: '/uploads/a.png' },
      ],
    }),
    {
      mode: '',
      prompt: '!pwd',
      command: '',
      reason: 'unsupported_blocks',
    }
  )
})
