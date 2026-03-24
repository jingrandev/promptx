import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createRelayUsageStore } from './relayUsageStore.js'

test('relay usage store aggregates connects and proxy requests by local day', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-usage-'))
  const filePath = path.join(tempDir, 'relay-usage.json')
  const store = createRelayUsageStore({ filePath })

  store.record({
    tenantKey: 'user1',
    type: 'connect',
    host: 'user1.promptx.test',
    deviceId: 'user1-mac',
    at: '2026-03-24T01:00:00+08:00',
  })
  store.record({
    tenantKey: 'user1',
    type: 'proxy_request',
    host: 'user1.promptx.test',
    deviceId: 'user1-mac',
    path: '/api/tasks',
    at: '2026-03-24T01:05:00+08:00',
  })
  store.record({
    tenantKey: 'user1',
    type: 'proxy_request',
    host: 'user1.promptx.test',
    deviceId: 'user1-mac',
    path: '/uploads/a.png',
    at: '2026-03-24T01:06:00+08:00',
  })
  store.record({
    tenantKey: 'user2',
    type: 'connect',
    host: 'user2.promptx.test',
    deviceId: 'user2-win',
    at: '2026-03-24T10:00:00+08:00',
  })

  store.flush()

  const report = store.getReport({
    days: 7,
    today: new Date('2026-03-24T12:00:00+08:00'),
  })

  assert.equal(report.today.date, '2026-03-24')
  assert.equal(report.today.tenantCount, 2)
  assert.equal(report.today.connectCount, 2)
  assert.equal(report.today.proxyRequestCount, 2)
  assert.equal(report.today.apiRequestCount, 1)
  assert.equal(report.today.uploadRequestCount, 1)
  assert.equal(report.today.tenants[0].tenantKey, 'user2')
  assert.equal(report.today.tenants[1].tenantKey, 'user1')

  const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert.equal(persisted.days['2026-03-24'].user1.proxyRequestCount, 2)
  assert.equal(persisted.days['2026-03-24'].user1.apiRequestCount, 1)
  assert.equal(persisted.days['2026-03-24'].user1.uploadRequestCount, 1)
})
