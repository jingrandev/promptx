import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProcessDetailTextBlocks } from './processDetailBlocks.js'

test('parseProcessDetailTextBlocks parses xml-like directory output', () => {
  const blocks = parseProcessDetailTextBlocks([
    'read: /tmp/project/src',
    '',
    '<path>/tmp/project/src</path>',
    '<type>directory</type>',
    '<entries>',
    'base.js',
    'hooks/',
    '(2 entries)',
    '</entries>',
  ].join('\n'))

  assert.equal(blocks[0]?.type, 'meta')
  assert.deepEqual(blocks[0]?.items, [{ label: 'read', value: '/tmp/project/src' }])
  assert.equal(blocks[1]?.type, 'directory_list')
  assert.equal(blocks[1]?.path, '/tmp/project/src')
  assert.equal(blocks[1]?.entryType, 'directory')
  assert.deepEqual(blocks[1]?.entries, ['base.js', 'hooks/'])
})

test('parseProcessDetailTextBlocks parses grep snippets with line numbers', () => {
  const blocks = parseProcessDetailTextBlocks([
    'Grep: /tmp/project/file.js',
    '',
    '473:function startFocusFollow(index, options = {}) {',
    '535:function placeCursor(index, position = null, options = {}) {',
    '644:  nextTick(() => placeCursor(index, 0))',
  ].join('\n'))

  assert.equal(blocks[0]?.type, 'meta')
  assert.equal(blocks[1]?.type, 'code_snippet')
  assert.deepEqual(blocks[1]?.lines, [
    { number: '473', content: 'function startFocusFollow(index, options = {}) {' },
    { number: '535', content: 'function placeCursor(index, position = null, options = {}) {' },
    { number: '644', content: ' nextTick(() => placeCursor(index, 0))' },
  ])
})

test('parseProcessDetailTextBlocks parses numbered lines', () => {
  const blocks = parseProcessDetailTextBlocks([
    '1-# Repository Guidelines',
    '2-',
    '3-## 沟通约定',
    '4-',
    '5-- 这个项目后续默认使用中文沟通。',
  ].join('\n'))

  assert.equal(blocks[0]?.type, 'numbered_lines')
  assert.deepEqual(blocks[0]?.items, [
    { number: '1', content: '# Repository Guidelines' },
    { number: '2', content: '' },
    { number: '3', content: '## 沟通约定' },
    { number: '4', content: '' },
    { number: '5', content: '- 这个项目后续默认使用中文沟通。' },
  ])
})

test('parseProcessDetailTextBlocks parses checklist', () => {
  const blocks = parseProcessDetailTextBlocks([
    '[x] 梳理现有实现',
    '[ ] 设计 detailBlocks',
    '[ ] 重做渲染组件',
  ].join('\n'))

  assert.equal(blocks[0]?.type, 'checklist')
  assert.deepEqual(blocks[0]?.items, [
    { completed: true, text: '梳理现有实现' },
    { completed: false, text: '设计 detailBlocks' },
    { completed: false, text: '重做渲染组件' },
  ])
})

