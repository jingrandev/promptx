import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'

import {
  normalizeRelayHost,
  normalizeRequestBodyToBuffer,
  readRelayServerConfig,
  resolveRelayTenantByHost,
  startRelayServer,
} from './relayServer.js'

function withEnv(overrides, run) {
  const previous = {}
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key]
    const value = overrides[key]
    if (value === null) {
      delete process.env[key]
      return
    }
    process.env[key] = value
  })

  try {
    return run()
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        delete process.env[key]
        return
      }
      process.env[key] = value
    })
  }
}

async function waitFor(check, timeoutMs = 2_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = check()
    if (value) {
      return value
    }
    await delay(20)
  }
  throw new Error('waitFor timeout')
}

function requestRelay({ port, host, path: requestPath, method = 'GET', body = '', headers = {} }) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  const normalizedHeaders = { ...headers }
  const hasExplicitContentType = Object.keys(normalizedHeaders).some((key) => String(key).toLowerCase() === 'content-type')
  const hasExplicitContentLength = Object.keys(normalizedHeaders).some((key) => String(key).toLowerCase() === 'content-length')

  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        Host: host,
        ...normalizedHeaders,
        ...(payload ? {
          ...(hasExplicitContentType ? {} : { 'content-type': 'application/json' }),
          ...(hasExplicitContentLength ? {} : { 'content-length': Buffer.byteLength(payload) }),
        } : {}),
      },
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        const responseType = String(response.headers['content-type'] || '').toLowerCase()
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: responseBody
            ? (responseType.includes('application/json') ? JSON.parse(responseBody) : responseBody)
            : null,
        })
      })
    })

    request.on('error', reject)
    if (payload) {
      request.write(payload)
    }
    request.end()
  })
}

test('normalizeRequestBodyToBuffer handles common relay request body shapes', () => {
  assert.equal(normalizeRequestBodyToBuffer(null).length, 0)
  assert.equal(normalizeRequestBodyToBuffer(undefined).length, 0)
  assert.equal(normalizeRequestBodyToBuffer('hello').toString('utf8'), 'hello')
  assert.equal(normalizeRequestBodyToBuffer({ foo: 'bar' }).toString('utf8'), '{"foo":"bar"}')
  assert.equal(normalizeRequestBodyToBuffer(123).toString('utf8'), '123')

  const source = Buffer.from('abc')
  assert.equal(normalizeRequestBodyToBuffer(source), source)

  const bytes = new Uint8Array([65, 66, 67])
  assert.equal(normalizeRequestBodyToBuffer(bytes).toString('utf8'), 'ABC')
})

test('normalizeRelayHost strips protocol, port and casing', () => {
  assert.equal(normalizeRelayHost('https://User1.PromptX.mushayu.com/path?a=1'), 'user1.promptx.mushayu.com')
  assert.equal(normalizeRelayHost('USER2.promptx.mushayu.com:443'), 'user2.promptx.mushayu.com')
  assert.equal(normalizeRelayHost(' user3.promptx.mushayu.com , proxy-host '), 'user3.promptx.mushayu.com')
})

test('resolveRelayTenantByHost matches configured subdomains', () => {
  const tenants = [
    {
      key: 'user1',
      hosts: ['user1.promptx.mushayu.com'],
      deviceToken: 'token-1',
      accessToken: 'access-1',
      expectedDeviceId: 'user1-mac',
    },
    {
      key: 'user2',
      hosts: ['user2.promptx.mushayu.com'],
      deviceToken: 'token-2',
      accessToken: 'access-2',
      expectedDeviceId: 'user2-mac',
    },
  ]

  assert.equal(resolveRelayTenantByHost(tenants, 'user1.promptx.mushayu.com:443')?.key, 'user1')
  assert.equal(resolveRelayTenantByHost(tenants, 'https://user2.promptx.mushayu.com')?.key, 'user2')
  assert.equal(resolveRelayTenantByHost(tenants, 'promptx.mushayu.com'), null)
})

test('readRelayServerConfig loads multi-tenant relay settings from file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-server-'))
  const configPath = path.join(tempDir, 'relay-tenants.json')
  fs.writeFileSync(configPath, `${JSON.stringify({
    tenants: [
      {
        key: 'user1',
        host: 'https://user1.promptx.mushayu.com',
        deviceId: 'user1-mac',
        deviceToken: 'token-1',
        accessToken: 'access-1',
      },
      {
        key: 'user2',
        hosts: ['user2.promptx.mushayu.com', 'USER2-ALT.promptx.mushayu.com'],
        deviceId: 'user2-mac',
        deviceToken: 'token-2',
        accessToken: 'access-2',
      },
    ],
  }, null, 2)}\n`, 'utf8')

  withEnv({
    PROMPTX_RELAY_TENANTS_FILE: configPath,
    PROMPTX_RELAY_HOST: '0.0.0.0',
    PROMPTX_RELAY_PORT: '3030',
    PROMPTX_RELAY_PUBLIC_URL: null,
    PROMPTX_RELAY_DEVICE_ID: null,
    PROMPTX_RELAY_DEVICE_TOKEN: null,
    PROMPTX_RELAY_ACCESS_TOKEN: null,
  }, () => {
    const config = readRelayServerConfig()
    assert.equal(config.tenantSource, configPath)
    assert.equal(config.tenants.length, 2)
    assert.deepEqual(config.tenants[0], {
      key: 'user1',
      hosts: ['user1.promptx.mushayu.com'],
      expectedDeviceId: 'user1-mac',
      deviceToken: 'token-1',
      accessToken: 'access-1',
    })
    assert.deepEqual(config.tenants[1], {
      key: 'user2',
      hosts: ['user2.promptx.mushayu.com', 'user2-alt.promptx.mushayu.com'],
      expectedDeviceId: 'user2-mac',
      deviceToken: 'token-2',
      accessToken: 'access-2',
    })
  })
})

test('relay login page uses POST and successful login sets cookie without query token', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-login-page-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-login</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: 'access-1',
        },
      ],
    },
  })

  try {
    const loginPage = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/relay/login?redirect=%2F',
      headers: {
        accept: 'text/html',
      },
    })
    assert.equal(loginPage.statusCode, 200)
    assert.match(String(loginPage.body || ''), /action="\/relay\/login" method="post"/)
    assert.doesNotMatch(String(loginPage.body || ''), /name="token" type="password".*method="get"/s)

    const loginResult = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/relay/login',
      method: 'POST',
      body: 'token=access-1&redirect=%2F',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
    assert.equal(loginResult.statusCode, 302)
    assert.equal(loginResult.headers.location, '/')
    assert.match(String(loginResult.headers['set-cookie'] || ''), /promptx_relay_access=/)
  } finally {
    await relay.close()
  }
})

test('relay login rate limit blocks repeated invalid attempts', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-login-limit-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-limit</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    loginRateLimitMaxAttempts: 2,
    loginRateLimitWindowMs: 60_000,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: 'access-1',
        },
      ],
    },
  })

  try {
    const firstAttempt = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/relay/login',
      method: 'POST',
      body: 'token=wrong&redirect=%2F',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
    assert.equal(firstAttempt.statusCode, 401)
    assert.match(String(firstAttempt.body || ''), /访问令牌不正确/)

    const secondAttempt = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/relay/login',
      method: 'POST',
      body: 'token=still-wrong&redirect=%2F',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
    assert.equal(secondAttempt.statusCode, 429)
    assert.match(String(secondAttempt.body || ''), /尝试次数过多/)
  } finally {
    await relay.close()
  }
})

test('relay admin login uses POST and successful login sets admin cookie', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-admin-login-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-admin-login</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      adminCookieName: 'promptx_relay_admin',
      adminToken: 'relay-admin-token',
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: 'access-1',
        },
      ],
    },
  })

  try {
    const loginPage = await requestRelay({
      port: relay.port,
      host: 'relay-admin.promptx.test',
      path: '/relay/admin/login?redirect=%2Frelay%2Fadmin%2Fusage',
      headers: {
        accept: 'text/html',
      },
    })
    assert.equal(loginPage.statusCode, 200)
    assert.match(String(loginPage.body || ''), /action="\/relay\/admin\/login" method="post"/)

    const loginResult = await requestRelay({
      port: relay.port,
      host: 'relay-admin.promptx.test',
      path: '/relay/admin/login',
      method: 'POST',
      body: 'token=relay-admin-token&redirect=%2Frelay%2Fadmin%2Fusage',
      headers: {
        accept: 'text/html',
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
    assert.equal(loginResult.statusCode, 302)
    assert.equal(loginResult.headers.location, '/relay/admin/usage')
    assert.match(String(loginResult.headers['set-cookie'] || ''), /promptx_relay_admin=/)
  } finally {
    await relay.close()
  }
})

test('multi-tenant relay routes requests to matching device sockets without cross-talk', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-web-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-test</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: '',
        },
        {
          key: 'user2',
          hosts: ['user2.promptx.test'],
          expectedDeviceId: 'user2-mac',
          deviceToken: 'token-2',
          accessToken: '',
        },
      ],
    },
  })

  const seenByTenant = {
    user1: [],
    user2: [],
  }

  function connectDevice({ tenantKey, host, deviceId, deviceToken }) {
    const socket = new WebSocket(`ws://127.0.0.1:${relay.port}/relay/connect`, {
      headers: {
        Host: host,
        'x-forwarded-host': host,
      },
    })
    const pending = new Map()
    let acknowledged = false

    socket.on('message', (payload, isBinary) => {
      if (isBinary) {
        return
      }

      const message = JSON.parse(payload.toString('utf8'))
      if (message.type === 'hello.ack') {
        acknowledged = true
        return
      }

      if (message.type === 'request.start') {
        pending.set(message.requestId, {
          method: message.method,
          path: message.path,
          bodyChunks: [],
        })
        return
      }

      if (message.type === 'request.body') {
        pending.get(message.requestId)?.bodyChunks.push(Buffer.from(String(message.chunk || ''), 'base64'))
        return
      }

      if (message.type === 'request.end') {
        const record = pending.get(message.requestId)
        pending.delete(message.requestId)
        seenByTenant[tenantKey].push({
          path: record?.path || '',
          method: record?.method || '',
          body: Buffer.concat(record?.bodyChunks || []).toString('utf8'),
        })

        const responseBody = Buffer.from(JSON.stringify({
          tenant: tenantKey,
          path: record?.path || '',
          body: Buffer.concat(record?.bodyChunks || []).toString('utf8'),
        }))

        socket.send(JSON.stringify({
          type: 'response.start',
          requestId: message.requestId,
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }))
        socket.send(JSON.stringify({
          type: 'response.body',
          requestId: message.requestId,
          chunk: responseBody.toString('base64'),
        }))
        socket.send(JSON.stringify({
          type: 'response.end',
          requestId: message.requestId,
        }))
      }
    })

    return new Promise((resolve, reject) => {
      socket.once('open', () => {
        socket.send(JSON.stringify({
          type: 'hello',
          deviceId,
          deviceToken,
          version: 'test',
        }))
        resolve({
          socket,
          async waitUntilReady() {
            await waitFor(() => acknowledged === true)
          },
          close() {
            socket.close()
          },
        })
      })
      socket.once('error', reject)
    })
  }

  let user1Device = null
  let user2Device = null
  try {
    user1Device = await connectDevice({
      tenantKey: 'user1',
      host: 'user1.promptx.test',
      deviceId: 'user1-mac',
      deviceToken: 'token-1',
    })
    user2Device = await connectDevice({
      tenantKey: 'user2',
      host: 'user2.promptx.test',
      deviceId: 'user2-mac',
      deviceToken: 'token-2',
    })

    await user1Device.waitUntilReady()
    await user2Device.waitUntilReady()

    const [user1Response, user2Response] = await Promise.all([
      requestRelay({
        port: relay.port,
        host: 'user1.promptx.test',
        path: '/api/tenant-check',
        method: 'POST',
        body: { hello: 'user1' },
      }),
      requestRelay({
        port: relay.port,
        host: 'user2.promptx.test',
        path: '/api/tenant-check?source=user2',
        method: 'POST',
        body: { hello: 'user2' },
      }),
    ])

    const user1Payload = user1Response.body
    const user2Payload = user2Response.body

    assert.equal(user1Payload.tenant, 'user1')
    assert.equal(user2Payload.tenant, 'user2')
    assert.equal(seenByTenant.user1.length, 1)
    assert.equal(seenByTenant.user2.length, 1)
    assert.match(seenByTenant.user1[0].body, /user1/)
    assert.match(seenByTenant.user2[0].body, /user2/)
    assert.equal(seenByTenant.user1[0].path.includes('source=user2'), false)
    assert.equal(seenByTenant.user2[0].path.includes('source=user2'), true)
  } finally {
    user1Device?.close()
    user2Device?.close()
    await relay.close()
  }
})

test('relay server closes stale device connection after heartbeat timeout', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-heartbeat-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-heartbeat</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    heartbeatIntervalMs: 40,
    heartbeatTimeoutMs: 90,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: '',
        },
      ],
    },
  })

  const socket = new WebSocket(`ws://127.0.0.1:${relay.port}/relay/connect`, {
    headers: {
      Host: 'user1.promptx.test',
      'x-forwarded-host': 'user1.promptx.test',
    },
  })

  let acknowledged = false
  let closeInfo = null

  socket.on('message', (payload, isBinary) => {
    if (isBinary) {
      return
    }
    const message = JSON.parse(payload.toString('utf8'))
    if (message.type === 'hello.ack') {
      acknowledged = true
    }
  })

  socket.on('close', (code, reason) => {
    closeInfo = {
      code,
      reason: reason.toString('utf8'),
    }
  })

  try {
    await new Promise((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })

    socket.send(JSON.stringify({
      type: 'hello',
      deviceId: 'user1-mac',
      deviceToken: 'token-1',
      version: 'test',
    }))

    await waitFor(() => acknowledged === true)

    socket.pong = () => {}

    await waitFor(() => closeInfo && closeInfo.reason === 'heartbeat_timeout', 2_000)

    const status = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/relay/device-status',
    })

    assert.equal(status.statusCode, 200)
    assert.equal(status.body.deviceOnline, false)
    assert.equal(status.body.lastDisconnectReason, 'heartbeat_timeout')
    assert.equal(status.body.lastDisconnectCode, 4000)
    assert.equal(Array.isArray(status.body.recentEvents), true)
    assert.equal(status.body.recentEvents.some((event) => event.type === 'heartbeat_timeout'), true)
    assert.equal(status.body.recentEvents.some((event) => event.type === 'auth_ok'), true)
  } finally {
    socket.close()
    await relay.close()
  }
})

test('relay admin usage api returns today tenant activity summary', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptx-relay-admin-usage-'))
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<!doctype html><html><body>relay-admin-usage</body></html>\n', 'utf8')

  const relay = await startRelayServer({
    logger: false,
    webDistDir: tempDir,
    config: {
      host: '127.0.0.1',
      port: 0,
      accessCookieName: 'promptx_relay_access',
      adminCookieName: 'promptx_relay_admin',
      adminToken: 'relay-admin-token',
      usageFile: path.join(tempDir, 'relay-usage.json'),
      tenantSource: 'test',
      tenants: [
        {
          key: 'user1',
          hosts: ['user1.promptx.test'],
          expectedDeviceId: 'user1-mac',
          deviceToken: 'token-1',
          accessToken: '',
        },
        {
          key: 'user2',
          hosts: ['user2.promptx.test'],
          expectedDeviceId: 'user2-win',
          deviceToken: 'token-2',
          accessToken: '',
        },
      ],
    },
  })

  function connectDevice({ host, deviceId, deviceToken }) {
    const socket = new WebSocket(`ws://127.0.0.1:${relay.port}/relay/connect`, {
      headers: {
        Host: host,
        'x-forwarded-host': host,
      },
    })
    const pending = new Map()
    let acknowledged = false

    socket.on('message', (payload, isBinary) => {
      if (isBinary) {
        return
      }

      const message = JSON.parse(payload.toString('utf8'))
      if (message.type === 'hello.ack') {
        acknowledged = true
        return
      }

      if (message.type === 'request.start') {
        pending.set(message.requestId, true)
        return
      }

      if (message.type === 'request.body') {
        return
      }

      if (message.type === 'request.end') {
        socket.send(JSON.stringify({
          type: 'response.start',
          requestId: message.requestId,
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        }))
        socket.send(JSON.stringify({
          type: 'response.body',
          requestId: message.requestId,
          chunk: Buffer.from(JSON.stringify({ ok: true })).toString('base64'),
        }))
        socket.send(JSON.stringify({
          type: 'response.end',
          requestId: message.requestId,
        }))
        pending.delete(message.requestId)
      }
    })

    socket.once('open', () => {
      socket.send(JSON.stringify({
        type: 'hello',
        deviceId,
        deviceToken,
        version: '0.1.12',
      }))
    })

    return {
      socket,
      waitForAck() {
        return waitFor(() => acknowledged === true)
      },
    }
  }

  try {
    const user1Device = connectDevice({
      host: 'user1.promptx.test',
      deviceId: 'user1-mac',
      deviceToken: 'token-1',
    })
    const user2Device = connectDevice({
      host: 'user2.promptx.test',
      deviceId: 'user2-win',
      deviceToken: 'token-2',
    })

    await Promise.all([user1Device.waitForAck(), user2Device.waitForAck()])

    const proxyResponse = await requestRelay({
      port: relay.port,
      host: 'user1.promptx.test',
      path: '/api/tasks',
      headers: {
        accept: 'application/json',
      },
    })
    assert.equal(proxyResponse.statusCode, 200)
    assert.deepEqual(proxyResponse.body, { ok: true })

    await delay(350)

    const usageResponse = await requestRelay({
      port: relay.port,
      host: 'relay-admin.promptx.test',
      path: '/relay/admin/api/usage?days=7',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer relay-admin-token',
      },
    })

    assert.equal(usageResponse.statusCode, 200)
    assert.equal(usageResponse.body.ok, true)
    assert.equal(usageResponse.body.today.tenantCount, 2)
    assert.equal(usageResponse.body.today.connectCount, 2)
    assert.equal(usageResponse.body.today.proxyRequestCount, 1)

    const user1 = usageResponse.body.today.tenants.find((item) => item.tenantKey === 'user1')
    const user2 = usageResponse.body.today.tenants.find((item) => item.tenantKey === 'user2')
    assert.equal(user1.connectCount, 1)
    assert.equal(user1.proxyRequestCount, 1)
    assert.equal(user1.apiRequestCount, 1)
    assert.equal(user1.lastDeviceId, 'user1-mac')
    assert.equal(user2.connectCount, 1)
    assert.equal(user2.proxyRequestCount, 0)

    user1Device.socket.close()
    user2Device.socket.close()
  } finally {
    await relay.close()
  }
})
