import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeClaudeEvents } from './claudeCodeRunner.js'

test('runner claudeCodeRunner maps fatal auth api_retry to error event', () => {
  assert.deepEqual(
    normalizeClaudeEvents({
      type: 'system',
      subtype: 'api_retry',
      attempt: 1,
      max_retries: 10,
      error_status: 401,
      error: 'authentication_failed',
    }),
    [{
      type: 'error',
      message: 'Claude Code 认证失败（HTTP 401 authentication_failed）。请重新登录 Claude Code，或检查当前环境中的认证令牌配置。',
    }]
  )
})

test('runner claudeCodeRunner maps transient api_retry to reconnecting error event', () => {
  assert.deepEqual(
    normalizeClaudeEvents({
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 10,
      error_status: 503,
      error: 'overloaded',
    }),
    [{
      type: 'error',
      message: 'Reconnecting... 2/10 (HTTP 503 overloaded)',
    }]
  )
})
