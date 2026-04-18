import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPatchPrefetchTargets } from './useTaskDiffReviewData.js'

test('buildPatchPrefetchTargets 优先当前选中文件并保持去重', () => {
  const files = [
    { path: 'b.js' },
    { path: 'a.js' },
    { path: 'c.js' },
  ]

  assert.deepEqual(
    buildPatchPrefetchTargets(files, 'c.js', 3),
    ['c.js', 'b.js', 'a.js']
  )
})

test('buildPatchPrefetchTargets 在未选中文件时返回前几个可见文件', () => {
  const files = [
    { path: 'b.js' },
    { path: 'a.js' },
    { path: 'c.js' },
  ]

  assert.deepEqual(
    buildPatchPrefetchTargets(files, '', 2),
    ['b.js', 'a.js']
  )
})
