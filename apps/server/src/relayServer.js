import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { WebSocketServer } from 'ws'

import { serverRootDir } from './appPaths.js'
import {
  chunkBuffer,
  constantTimeEqual,
  createRelayRequestId,
  decodeChunk,
  encodeChunk,
  parseCookieHeader,
  sanitizeProxyHeaders,
} from './relayProtocol.js'
import { createRelayUsageStore } from './relayUsageStore.js'

const DEFAULT_RELAY_PORT = 3030
const DEFAULT_RELAY_HOST = '0.0.0.0'
const DEFAULT_COOKIE_NAME = 'promptx_relay_access'
const DEFAULT_ADMIN_COOKIE_NAME = 'promptx_relay_admin'
const DEVICE_AUTH_TIMEOUT_MS = 5_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 55_000
const MAX_RECENT_EVENTS = 100

function normalizeRelayHost(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }

  const firstValue = raw.split(',')[0]?.trim() || ''
  if (!firstValue) {
    return ''
  }

  try {
    const withProtocol = /^[a-z]+:\/\//i.test(firstValue) ? firstValue : `http://${firstValue}`
    return String(new URL(withProtocol).hostname || '').trim().toLowerCase().replace(/\.$/, '')
  } catch {
    return firstValue.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  }
}

function normalizeRelayTenantConfig(input = {}, index = 0) {
  const hosts = [
    ...(Array.isArray(input?.hosts) ? input.hosts : []),
    input?.host,
    input?.publicUrl,
  ]
    .map((item) => normalizeRelayHost(item))
    .filter(Boolean)
    .filter((item, itemIndex, items) => items.indexOf(item) === itemIndex)

  const key = String(
    input?.key
    || input?.slug
    || (hosts[0] ? hosts[0].split('.')[0] : '')
    || `tenant-${index + 1}`
  ).trim()

  return {
    key,
    hosts,
    expectedDeviceId: String(input?.deviceId || input?.expectedDeviceId || '').trim(),
    deviceToken: String(input?.deviceToken || '').trim(),
    accessToken: String(input?.accessToken || '').trim(),
  }
}

function readRelayTenantsFromFile(filePath) {
  const resolvedPath = path.resolve(String(filePath || '').trim())
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  const tenantItems = Array.isArray(payload) ? payload : payload?.tenants
  if (!Array.isArray(tenantItems) || !tenantItems.length) {
    throw new Error('PROMPTX_RELAY_TENANTS_FILE 中未找到 tenants 配置。')
  }

  return {
    source: resolvedPath,
    tenants: tenantItems.map((item, index) => normalizeRelayTenantConfig(item, index)),
  }
}

function readRelayTenantsFromEnv() {
  const tenant = normalizeRelayTenantConfig({
    key: process.env.PROMPTX_RELAY_TENANT_KEY || 'default',
    host: process.env.PROMPTX_RELAY_PUBLIC_URL,
    expectedDeviceId: process.env.PROMPTX_RELAY_DEVICE_ID,
    deviceToken: process.env.PROMPTX_RELAY_DEVICE_TOKEN,
    accessToken: process.env.PROMPTX_RELAY_ACCESS_TOKEN,
  })

  return {
    source: 'env',
    tenants: [tenant],
  }
}

function readRelayServerConfig() {
  const tenantsFile = String(process.env.PROMPTX_RELAY_TENANTS_FILE || '').trim()
  const tenantConfig = tenantsFile ? readRelayTenantsFromFile(tenantsFile) : readRelayTenantsFromEnv()
  const keySet = new Set()
  const hostSet = new Set()

  tenantConfig.tenants.forEach((tenant) => {
    if (!tenant.key) {
      throw new Error('Relay tenant 缺少 key。')
    }
    if (!tenant.deviceToken) {
      throw new Error(`Relay tenant ${tenant.key} 缺少 deviceToken。`)
    }
    if (keySet.has(tenant.key)) {
      throw new Error(`Relay tenant key 重复：${tenant.key}`)
    }
    keySet.add(tenant.key)

    tenant.hosts.forEach((host) => {
      if (hostSet.has(host)) {
        throw new Error(`Relay tenant host 重复：${host}`)
      }
      hostSet.add(host)
    })
  })

  return {
    host: String(process.env.PROMPTX_RELAY_HOST || process.env.HOST || DEFAULT_RELAY_HOST).trim() || DEFAULT_RELAY_HOST,
    port: Math.max(1, Number(process.env.PROMPTX_RELAY_PORT || process.env.PORT) || DEFAULT_RELAY_PORT),
    accessCookieName: String(process.env.PROMPTX_RELAY_ACCESS_COOKIE || DEFAULT_COOKIE_NAME).trim() || DEFAULT_COOKIE_NAME,
    adminCookieName: String(process.env.PROMPTX_RELAY_ADMIN_COOKIE || DEFAULT_ADMIN_COOKIE_NAME).trim() || DEFAULT_ADMIN_COOKIE_NAME,
    adminToken: String(process.env.PROMPTX_RELAY_ADMIN_TOKEN || '').trim(),
    usageFile: String(process.env.PROMPTX_RELAY_USAGE_FILE || '').trim(),
    tenants: tenantConfig.tenants,
    tenantSource: tenantConfig.source,
  }
}

function resolveRelayTenantByHost(tenants = [], rawHost = '') {
  const normalizedHost = normalizeRelayHost(rawHost)
  if (!normalizedHost) {
    return tenants.length === 1 && tenants[0].hosts.length === 0 ? tenants[0] : null
  }

  const exactMatch = tenants.find((tenant) => tenant.hosts.includes(normalizedHost))
  if (exactMatch) {
    return exactMatch
  }

  return tenants.length === 1 && tenants[0].hosts.length === 0 ? tenants[0] : null
}

function getWebDistRoot() {
  return path.resolve(serverRootDir, '..', 'web', 'dist')
}

function buildLoginPage({
  errorMessage = '',
  redirectPath = '/',
  tenantLabel = '',
} = {}) {
  const escapedError = String(errorMessage || '').replace(/[<>&"]/g, '')
  const escapedRedirect = String(redirectPath || '/').replace(/"/g, '&quot;')
  const escapedTenantLabel = String(tenantLabel || '').replace(/[<>&"]/g, '')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PromptX Relay 登录</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f5f4; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .card { width: min(92vw, 420px); border: 1px solid #d6d3d1; background: #fffbeb; box-shadow: 8px 8px 0 rgba(28,25,23,.06); padding: 24px; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    p { margin: 0 0 16px; line-height: 1.6; color: #57534e; }
    label { display: block; margin-bottom: 8px; font-size: 13px; color: #44403c; }
    input { box-sizing: border-box; width: 100%; border: 1px solid #a8a29e; padding: 10px 12px; background: white; }
    button { margin-top: 14px; width: 100%; border: 1px solid #166534; background: #16a34a; color: white; padding: 10px 12px; cursor: pointer; }
    .error { margin-bottom: 12px; color: #b91c1c; font-size: 13px; }
    .tenant { display: inline-block; margin-bottom: 10px; padding: 2px 8px; border: 1px dashed #86efac; color: #166534; font-size: 12px; }
  </style>
</head>
<body>
  <form class="card" action="/relay/login" method="get">
    ${escapedTenantLabel ? `<div class="tenant">${escapedTenantLabel}</div>` : ''}
    <h1>PromptX Relay</h1>
    <p>请输入远程访问令牌，进入你自己的 PromptX 工作台。</p>
    ${escapedError ? `<div class="error">${escapedError}</div>` : ''}
    <input type="hidden" name="redirect" value="${escapedRedirect}" />
    <label for="token">访问令牌</label>
    <input id="token" name="token" type="password" autocomplete="current-password" required />
    <button type="submit">进入 PromptX</button>
  </form>
</body>
</html>`
}

function buildUnknownTenantPage(host = '') {
  const escapedHost = String(host || '').replace(/[<>&"]/g, '')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PromptX Relay</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f5f4; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .card { width: min(92vw, 480px); border: 1px solid #d6d3d1; background: white; box-shadow: 8px 8px 0 rgba(28,25,23,.06); padding: 24px; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0; line-height: 1.7; color: #57534e; }
    code { padding: 2px 6px; background: #f5f5f4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>PromptX Relay 未匹配到租户</h1>
    <p>当前访问域名 <code>${escapedHost || 'unknown-host'}</code> 没有配置到 Relay。请检查 DNS、Nginx 与租户配置文件。</p>
  </div>
</body>
</html>`
}

function buildAdminLoginPage({ errorMessage = '', redirectPath = '/relay/admin/usage' } = {}) {
  const escapedError = String(errorMessage || '').replace(/[<>&"]/g, '')
  const escapedRedirect = String(redirectPath || '/relay/admin/usage').replace(/"/g, '&quot;')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PromptX Relay 管理登录</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f5f4; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .card { width: min(92vw, 440px); border: 1px solid #d6d3d1; background: #fafaf9; box-shadow: 8px 8px 0 rgba(28,25,23,.06); padding: 24px; }
    h1 { margin: 0 0 10px; font-size: 22px; }
    p { margin: 0 0 16px; line-height: 1.6; color: #57534e; }
    label { display: block; margin-bottom: 8px; font-size: 13px; color: #44403c; }
    input { box-sizing: border-box; width: 100%; border: 1px solid #a8a29e; padding: 10px 12px; background: white; }
    button { margin-top: 14px; width: 100%; border: 1px solid #166534; background: #16a34a; color: white; padding: 10px 12px; cursor: pointer; }
    .error { margin-bottom: 12px; color: #b91c1c; font-size: 13px; }
    .hint { margin-top: 14px; font-size: 12px; color: #78716c; }
  </style>
</head>
<body>
  <form class="card" action="/relay/admin/login" method="get">
    <h1>Relay 使用统计</h1>
    <p>请输入管理口令，查看今天有哪些租户正在使用你的 PromptX Relay。</p>
    ${escapedError ? `<div class="error">${escapedError}</div>` : ''}
    <input type="hidden" name="redirect" value="${escapedRedirect}" />
    <label for="token">管理口令</label>
    <input id="token" name="token" type="password" autocomplete="current-password" required />
    <button type="submit">进入统计页</button>
    <div class="hint">可通过环境变量 <code>PROMPTX_RELAY_ADMIN_TOKEN</code> 配置。</div>
  </form>
</body>
</html>`
}

function buildRelayUsagePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PromptX Relay 使用统计</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f5f4; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    main { max-width: 1160px; margin: 0 auto; padding: 28px 18px 40px; }
    .header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .title { margin: 0; font-size: 28px; }
    .muted { color: #57534e; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .toolbar select, .toolbar button { height: 38px; border: 1px solid #d6d3d1; background: white; padding: 0 12px; }
    .toolbar button { cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 16px 0 20px; }
    .card { border: 1px solid #d6d3d1; background: #ffffff; box-shadow: 6px 6px 0 rgba(28,25,23,.04); padding: 16px; }
    .card h2 { margin: 0 0 8px; font-size: 13px; color: #57534e; font-weight: 600; }
    .metric { font-size: 30px; font-weight: 700; }
    .metric-sub { margin-top: 6px; color: #78716c; font-size: 12px; }
    .layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 14px; }
    .panel-title { margin: 0 0 12px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e7e5e4; padding: 10px 8px; text-align: left; vertical-align: top; }
    th { border-top: 0; color: #57534e; font-weight: 600; font-size: 12px; }
    tbody tr:hover { background: #fafaf9; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border: 1px dashed #a8a29e; font-size: 12px; color: #44403c; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .day-list { display: grid; gap: 10px; }
    .day-row { border: 1px dashed #d6d3d1; background: #fafaf9; padding: 10px 12px; }
    .day-row strong { display: block; margin-bottom: 4px; }
    .empty { padding: 24px; border: 1px dashed #d6d3d1; background: #fafaf9; color: #78716c; text-align: center; }
    .error { padding: 14px 16px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="header">
      <div>
        <h1 class="title">Relay 使用统计</h1>
        <div id="generatedAt" class="muted">读取中...</div>
      </div>
      <div class="toolbar">
        <label class="muted" for="days">最近</label>
        <select id="days">
          <option value="7">7 天</option>
          <option value="14">14 天</option>
          <option value="30">30 天</option>
        </select>
        <button id="refreshBtn" type="button">刷新</button>
      </div>
    </div>

    <section class="grid" id="summaryCards"></section>

    <div class="layout">
      <section class="card">
        <h2 class="panel-title">今日活跃租户</h2>
        <div id="todayTableWrap"></div>
      </section>
      <section class="card">
        <h2 class="panel-title">最近几天</h2>
        <div id="recentDays"></div>
      </section>
    </div>
  </main>

  <script>
    const generatedAtEl = document.getElementById('generatedAt')
    const summaryCardsEl = document.getElementById('summaryCards')
    const todayTableWrapEl = document.getElementById('todayTableWrap')
    const recentDaysEl = document.getElementById('recentDays')
    const daysSelectEl = document.getElementById('days')
    const refreshBtnEl = document.getElementById('refreshBtn')

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] || char))
    }

    function formatDateTime(value) {
      const raw = String(value || '').trim()
      if (!raw) return '-'
      const date = new Date(raw)
      if (Number.isNaN(date.getTime())) return raw
      return date.toLocaleString('zh-CN')
    }

    function renderSummary(today) {
      const cards = [
        { label: '今日活跃租户', value: today.tenantCount || 0, sub: '至少连接过一次或转发过一次请求' },
        { label: '今日设备连接', value: today.connectCount || 0, sub: '设备成功连上 Relay 的次数' },
        { label: '今日转发请求', value: today.proxyRequestCount || 0, sub: '真实通过 Relay 转发到本地的请求数' },
        { label: '今日 API 请求', value: today.apiRequestCount || 0, sub: '只统计 /api/*' },
      ]
      summaryCardsEl.innerHTML = cards.map((item) => \`
        <section class="card">
          <h2>\${escapeHtml(item.label)}</h2>
          <div class="metric">\${escapeHtml(item.value)}</div>
          <div class="metric-sub">\${escapeHtml(item.sub)}</div>
        </section>
      \`).join('')
    }

    function renderTodayTable(today) {
      const tenants = Array.isArray(today.tenants) ? today.tenants : []
      if (!tenants.length) {
        todayTableWrapEl.innerHTML = '<div class="empty">今天还没有租户使用 Relay。</div>'
        return
      }

      todayTableWrapEl.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>租户</th>
              <th>连接</th>
              <th>请求</th>
              <th>最近设备</th>
              <th>最近活跃</th>
            </tr>
          </thead>
          <tbody>
            \${tenants.map((item) => \`
              <tr>
                <td>
                  <div><strong>\${escapeHtml(item.tenantKey)}</strong></div>
                  <div class="muted mono">\${escapeHtml(item.host || '-')}</div>
                </td>
                <td>\${escapeHtml(item.connectCount || 0)}</td>
                <td>
                  <div>\${escapeHtml(item.proxyRequestCount || 0)}</div>
                  <div class="muted">API \${escapeHtml(item.apiRequestCount || 0)} / 上传 \${escapeHtml(item.uploadRequestCount || 0)}</div>
                </td>
                <td class="mono">\${escapeHtml(item.lastDeviceId || '-')}</td>
                <td>\${escapeHtml(formatDateTime(item.lastSeenAt))}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`
    }

    function renderRecentDays(days) {
      if (!Array.isArray(days) || !days.length) {
        recentDaysEl.innerHTML = '<div class="empty">还没有历史统计。</div>'
        return
      }

      recentDaysEl.innerHTML = '<div class="day-list">' + days.map((item) => \`
        <div class="day-row">
          <strong>\${escapeHtml(item.date)}</strong>
          <div class="muted">活跃租户 \${escapeHtml(item.tenantCount || 0)} / 连接 \${escapeHtml(item.connectCount || 0)} / 请求 \${escapeHtml(item.proxyRequestCount || 0)}</div>
        </div>
      \`).join('') + '</div>'
    }

    async function loadUsage() {
      generatedAtEl.textContent = '读取中...'
      todayTableWrapEl.innerHTML = ''
      recentDaysEl.innerHTML = ''
      const days = Number(daysSelectEl.value || 7) || 7
      try {
        const response = await fetch('/relay/admin/api/usage?days=' + encodeURIComponent(days), {
          credentials: 'include',
          headers: { accept: 'application/json' },
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload && payload.message ? payload.message : '统计读取失败')
        }
        const payload = await response.json()
        generatedAtEl.textContent = '最近更新：' + formatDateTime(payload.generatedAt)
        renderSummary(payload.today || {})
        renderTodayTable(payload.today || {})
        renderRecentDays(payload.recentDays || [])
      } catch (error) {
        summaryCardsEl.innerHTML = ''
        const message = escapeHtml(error && error.message ? error.message : '统计读取失败')
        todayTableWrapEl.innerHTML = '<div class="error">' + message + '</div>'
        recentDaysEl.innerHTML = ''
        generatedAtEl.textContent = '读取失败'
      }
    }

    daysSelectEl.addEventListener('change', loadUsage)
    refreshBtnEl.addEventListener('click', loadUsage)
    loadUsage()
  </script>
</body>
</html>`
}

function getRequestPath(request) {
  return String(request.raw.url || '/').split('?')[0] || '/'
}

function isHtmlRequest(request) {
  const accept = String(request.headers.accept || '').toLowerCase()
  return accept.includes('text/html')
}

function normalizeRedirectPath(value = '/') {
  const raw = String(value || '/').trim()
  if (!raw.startsWith('/')) {
    return '/'
  }
  if (raw.startsWith('//') || raw.startsWith('/relay/login')) {
    return '/'
  }
  return raw
}

function normalizeAdminRedirectPath(value = '/relay/admin/usage') {
  const normalized = normalizeRedirectPath(value || '/relay/admin/usage')
  return normalized.startsWith('/relay/admin') ? normalized : '/relay/admin/usage'
}

function createCookieValue(name, value, secure = false) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`
}

function normalizeRequestBodyToBuffer(body) {
  if (Buffer.isBuffer(body)) {
    return body
  }

  if (typeof body === 'string') {
    return Buffer.from(body)
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }

  if (body === null || typeof body === 'undefined') {
    return Buffer.alloc(0)
  }

  if (typeof body === 'object') {
    return Buffer.from(JSON.stringify(body))
  }

  return Buffer.from(String(body))
}

function getRequestHost(request) {
  return normalizeRelayHost(request?.headers?.['x-forwarded-host'] || request?.headers?.host || '')
}

function isHttpsRequest(request) {
  const forwardedProto = String(request?.headers?.['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase()
  if (forwardedProto) {
    return forwardedProto === 'https'
  }

  return Boolean(request?.socket?.encrypted)
}

function createTenantState(tenant) {
  return {
    tenantKey: tenant.key,
    tenantHosts: tenant.hosts,
    socket: null,
    deviceId: '',
    connectedAt: '',
    lastHeartbeatAt: '',
    lastDisconnectedAt: '',
    lastDisconnectCode: 0,
    lastDisconnectReason: '',
    version: '',
    recentEvents: [],
  }
}

async function startRelayServer(options = {}) {
  const config = options.config || readRelayServerConfig()
  const webDistDir = options.webDistDir || getWebDistRoot()
  const webIndexPath = path.join(webDistDir, 'index.html')
  if (!fs.existsSync(webIndexPath)) {
    throw new Error('没有找到前端构建产物，请先运行 `pnpm build`。')
  }

  const app = Fastify({
    logger: typeof options.logger === 'undefined' ? true : options.logger,
    bodyLimit: 35 * 1024 * 1024,
  })
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (request, body, done) => {
    done(null, body)
  })

  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: '/',
    wildcard: false,
    index: false,
  })

  const wsServer = new WebSocketServer({ noServer: true })
  const requestMap = new Map()
  const tenantStateMap = new Map(config.tenants.map((tenant) => [tenant.key, createTenantState(tenant)]))
  const tenantConfigMap = new Map(config.tenants.map((tenant) => [tenant.key, tenant]))
  const usageStore = options.usageStore || createRelayUsageStore({
    filePath: config.usageFile || undefined,
  })
  const heartbeatIntervalMs = Math.max(100, Number(options.heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS)
  const heartbeatTimeoutMs = Math.max(
    heartbeatIntervalMs,
    Number(options.heartbeatTimeoutMs) || DEFAULT_HEARTBEAT_TIMEOUT_MS
  )

  function getTenantState(tenantKey) {
    return tenantStateMap.get(String(tenantKey || '').trim()) || null
  }

  function appendTenantEvent(tenantKey, type, extra = {}) {
    const tenantState = getTenantState(tenantKey)
    if (!tenantState) {
      return null
    }

    const nextEvent = {
      at: new Date().toISOString(),
      type: String(type || '').trim() || 'unknown',
      ...extra,
    }
    tenantState.recentEvents = [nextEvent, ...(tenantState.recentEvents || [])].slice(0, MAX_RECENT_EVENTS)
    return nextEvent
  }

  function getTenantForRequest(request) {
    return resolveRelayTenantByHost(config.tenants, getRequestHost(request))
  }

  function replyUnknownTenant(request, reply) {
    const host = getRequestHost(request)
    if (isHtmlRequest(request)) {
      return reply.code(404).type('text/html; charset=utf-8').send(buildUnknownTenantPage(host))
    }
    return reply.code(404).send({
      message: '当前域名未配置到 PromptX Relay。',
      host,
    })
  }

  function requireTenantRequest(request, reply) {
    const tenant = getTenantForRequest(request)
    if (tenant) {
      return tenant
    }
    replyUnknownTenant(request, reply)
    return null
  }

  function isAuthorizedRequest(request, tenant) {
    if (!tenant?.accessToken) {
      return true
    }

    const bearerToken = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (bearerToken && constantTimeEqual(bearerToken, tenant.accessToken)) {
      return true
    }

    const cookies = parseCookieHeader(request.headers.cookie)
    return constantTimeEqual(cookies[config.accessCookieName] || '', tenant.accessToken)
  }

  function ensureAuthorized(request, reply, tenant) {
    if (isAuthorizedRequest(request, tenant)) {
      return true
    }

    if (isHtmlRequest(request)) {
      return reply
        .code(401)
        .type('text/html; charset=utf-8')
        .send(buildLoginPage({
          redirectPath: getRequestPath(request),
          tenantLabel: tenant?.key || getRequestHost(request),
        }))
    }

    return reply.code(401).send({ message: '未通过 relay 访问验证。' })
  }

  function isAdminAuthorized(request) {
    if (!config.adminToken) {
      return true
    }

    const bearerToken = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (bearerToken && constantTimeEqual(bearerToken, config.adminToken)) {
      return true
    }

    const cookies = parseCookieHeader(request.headers.cookie)
    return constantTimeEqual(cookies[config.adminCookieName] || '', config.adminToken)
  }

  function ensureAdminAuthorized(request, reply) {
    if (isAdminAuthorized(request)) {
      return true
    }

    if (isHtmlRequest(request)) {
      return reply
        .code(401)
        .type('text/html; charset=utf-8')
        .send(buildAdminLoginPage({
          redirectPath: normalizeAdminRedirectPath(request.query?.redirect || getRequestPath(request)),
        }))
    }

    return reply.code(401).send({ message: '未通过 Relay 管理验证。' })
  }

  function getActiveDeviceSocket(tenantKey) {
    const tenantState = getTenantState(tenantKey)
    if (!tenantState?.socket || tenantState.socket.readyState !== 1) {
      return null
    }
    return tenantState.socket
  }

  function clearPendingRequest(requestId, reason = 'request_closed') {
    const record = requestMap.get(requestId)
    if (!record) {
      return
    }
    requestMap.delete(requestId)
    try {
      getActiveDeviceSocket(record.tenantKey)?.send(JSON.stringify({
        type: 'request.cancel',
        requestId,
        reason,
      }))
    } catch {
      // Ignore send failures after disconnect.
    }
  }

  function writeRelayResponseStart(record, payload) {
    if (record.started) {
      return
    }
    record.started = true
    record.reply.raw.writeHead(payload.status || 200, sanitizeProxyHeaders(payload.headers, ['content-encoding']))
  }

  function writeRelayResponseBody(record, payload) {
    if (!record.started) {
      writeRelayResponseStart(record, { status: 200, headers: {} })
    }
    const chunk = decodeChunk(payload.chunk)
    if (chunk.length) {
      record.reply.raw.write(chunk)
    }
  }

  function finalizeRelayResponse(record) {
    if (!record.reply.raw.writableEnded) {
      record.reply.raw.end()
    }
  }

  function failRelayRequest(record, statusCode = 502, message = 'Relay 请求失败。') {
    if (!record.reply.raw.writableEnded) {
      if (!record.started) {
        record.reply.raw.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
      }
      record.reply.raw.end(JSON.stringify({ message }))
    }
  }

  function sendRequestToDevice(socket, requestId, request) {
    const requestPath = String(request.raw.url || '/')
    const bodyBuffer = normalizeRequestBodyToBuffer(request.body)

    socket.send(JSON.stringify({
      type: 'request.start',
      requestId,
      method: String(request.method || 'GET').toUpperCase(),
      path: requestPath,
      headers: sanitizeProxyHeaders(request.headers, ['cookie']),
    }))

    chunkBuffer(bodyBuffer).forEach((chunk) => {
      socket.send(JSON.stringify({
        type: 'request.body',
        requestId,
        chunk: encodeChunk(chunk),
      }))
    })

    socket.send(JSON.stringify({
      type: 'request.end',
      requestId,
    }))
  }

  function handleProxyRequest(request, reply) {
    const tenant = requireTenantRequest(request, reply)
    if (!tenant) {
      return
    }

    if (ensureAuthorized(request, reply, tenant) !== true) {
      return
    }

    const deviceSocket = getActiveDeviceSocket(tenant.key)
    if (!deviceSocket) {
      app.log.warn({ tenantKey: tenant.key, host: getRequestHost(request) }, '[relay] 当前租户没有在线设备')
      return reply.code(503).send({ message: 'PromptX 本地设备暂未连接到 relay。' })
    }

    const requestId = createRelayRequestId()
    reply.hijack()
    requestMap.set(requestId, {
      requestId,
      tenantKey: tenant.key,
      request,
      reply,
      started: false,
    })

    reply.raw.on('close', () => {
      clearPendingRequest(requestId, 'browser_closed')
    })

    try {
      sendRequestToDevice(deviceSocket, requestId, request)
      usageStore.record({
        tenantKey: tenant.key,
        type: 'proxy_request',
        host: getRequestHost(request),
        deviceId: getTenantState(tenant.key)?.deviceId || '',
        path: String(request.raw.url || '/'),
      })
    } catch (error) {
      const record = requestMap.get(requestId)
      requestMap.delete(requestId)
      if (record) {
        failRelayRequest(record, 502, error?.message || '发送 relay 请求失败。')
      }
    }
  }

  app.get('/health', async (request) => {
    const tenant = getTenantForRequest(request)
    if (tenant) {
      const tenantState = getTenantState(tenant.key)
      return {
        ok: true,
        tenant: tenant.key,
        host: getRequestHost(request),
        deviceOnline: Boolean(getActiveDeviceSocket(tenant.key)),
        deviceId: tenantState?.deviceId || '',
      }
    }

    return {
      ok: true,
      tenants: config.tenants.map((item) => {
        const tenantState = getTenantState(item.key)
        return {
          key: item.key,
          hosts: item.hosts,
          deviceOnline: Boolean(getActiveDeviceSocket(item.key)),
          deviceId: tenantState?.deviceId || '',
          lastHeartbeatAt: tenantState?.lastHeartbeatAt || '',
          lastDisconnectedAt: tenantState?.lastDisconnectedAt || '',
          lastDisconnectReason: tenantState?.lastDisconnectReason || '',
          recentEvents: tenantState?.recentEvents || [],
        }
      }),
    }
  })

  app.get('/relay/device-status', async (request, reply) => {
    const tenant = requireTenantRequest(request, reply)
    if (!tenant) {
      return
    }

    if (ensureAuthorized(request, reply, tenant) !== true) {
      return
    }

    const tenantState = getTenantState(tenant.key)
    return {
      ok: true,
      tenant: tenant.key,
      host: getRequestHost(request),
      deviceOnline: Boolean(getActiveDeviceSocket(tenant.key)),
      deviceId: tenantState?.deviceId || '',
      connectedAt: tenantState?.connectedAt || '',
      lastHeartbeatAt: tenantState?.lastHeartbeatAt || '',
      lastDisconnectedAt: tenantState?.lastDisconnectedAt || '',
      lastDisconnectCode: tenantState?.lastDisconnectCode || 0,
      lastDisconnectReason: tenantState?.lastDisconnectReason || '',
      version: tenantState?.version || '',
      recentEvents: tenantState?.recentEvents || [],
    }
  })

  app.get('/relay/admin/login', async (request, reply) => {
    if (!config.adminToken) {
      return reply.redirect('/relay/admin/usage')
    }

    const token = String(request.query?.token || '').trim()
    const redirectPath = normalizeAdminRedirectPath(request.query?.redirect)
    if (token && constantTimeEqual(token, config.adminToken)) {
      reply.header('Set-Cookie', createCookieValue(config.adminCookieName, config.adminToken, isHttpsRequest(request)))
      return reply.redirect(redirectPath)
    }

    return reply
      .code(token ? 401 : 200)
      .type('text/html; charset=utf-8')
      .send(buildAdminLoginPage({
        errorMessage: token ? '管理口令不正确。' : '',
        redirectPath,
      }))
  })

  app.get('/relay/admin/api/usage', async (request, reply) => {
    if (ensureAdminAuthorized(request, reply) !== true) {
      return
    }

    const days = Math.max(1, Math.min(90, Number(request.query?.days) || 7))
    return {
      ok: true,
      ...usageStore.getReport({ days }),
    }
  })

  app.get('/relay/admin/usage', async (request, reply) => {
    if (ensureAdminAuthorized(request, reply) !== true) {
      return
    }

    return reply.type('text/html; charset=utf-8').send(buildRelayUsagePage())
  })

  app.get('/relay/login', async (request, reply) => {
    const tenant = requireTenantRequest(request, reply)
    if (!tenant) {
      return
    }

    if (!tenant.accessToken) {
      return reply.redirect('/')
    }

    const token = String(request.query?.token || '').trim()
    const redirectPath = normalizeRedirectPath(request.query?.redirect)
    if (token && constantTimeEqual(token, tenant.accessToken)) {
      reply.header('Set-Cookie', createCookieValue(config.accessCookieName, tenant.accessToken, isHttpsRequest(request)))
      return reply.redirect(redirectPath)
    }

    return reply
      .code(token ? 401 : 200)
      .type('text/html; charset=utf-8')
      .send(buildLoginPage({
        errorMessage: token ? '访问令牌不正确。' : '',
        redirectPath,
        tenantLabel: tenant.key,
      }))
  })

  app.route({
    method: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'],
    url: '/api/*',
    handler: handleProxyRequest,
  })

  app.route({
    method: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'],
    url: '/uploads/*',
    handler: handleProxyRequest,
  })

  app.get('/', async (request, reply) => {
    const tenant = requireTenantRequest(request, reply)
    if (!tenant) {
      return
    }
    if (ensureAuthorized(request, reply, tenant) !== true) {
      return
    }
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(webIndexPath))
  })

  app.get('/*', async (request, reply) => {
    if (getRequestPath(request).startsWith('/relay/')) {
      return reply.code(404).send({ message: '资源不存在。' })
    }

    const tenant = requireTenantRequest(request, reply)
    if (!tenant) {
      return
    }
    if (ensureAuthorized(request, reply, tenant) !== true) {
      return
    }
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(webIndexPath))
  })

  const heartbeatTimer = setInterval(() => {
    tenantStateMap.forEach((tenantState, tenantKey) => {
      const activeSocket = tenantState?.socket
      if (!activeSocket || activeSocket.readyState !== 1) {
        return
      }

      const lastHeartbeatAt = Date.parse(tenantState.lastHeartbeatAt || tenantState.connectedAt || '')
      const elapsedMs = Number.isFinite(lastHeartbeatAt) ? Date.now() - lastHeartbeatAt : Number.POSITIVE_INFINITY
      if (elapsedMs > heartbeatTimeoutMs) {
        const tenant = tenantConfigMap.get(tenantKey)
        appendTenantEvent(tenantKey, 'heartbeat_timeout', {
          deviceId: tenantState.deviceId || '',
          elapsedMs,
          heartbeatTimeoutMs,
        })
        app.log.warn({
          tenantKey,
          host: tenant?.hosts?.[0] || '',
          deviceId: tenantState.deviceId || 'unknown-device',
          elapsedMs,
          heartbeatTimeoutMs,
        }, '[relay] 心跳超时，连接将被关闭')
        try {
          activeSocket.close(4000, 'heartbeat_timeout')
        } catch {
          // Ignore close failures for half-open sockets.
        }
        return
      }

      try {
        activeSocket.ping()
      } catch (error) {
        const tenant = tenantConfigMap.get(tenantKey)
        appendTenantEvent(tenantKey, 'heartbeat_ping_failed', {
          deviceId: tenantState.deviceId || '',
          error: error?.message || String(error || ''),
        })
        app.log.warn({
          tenantKey,
          host: tenant?.hosts?.[0] || '',
          deviceId: tenantState.deviceId || 'unknown-device',
          error: error?.message || String(error || ''),
        }, '[relay] 心跳发送失败，连接将被关闭')
        try {
          activeSocket.close(4000, 'heartbeat_timeout')
        } catch {
          // Ignore close failures for half-open sockets.
        }
      }
    })
  }, heartbeatIntervalMs)
  heartbeatTimer.unref?.()

  wsServer.on('connection', (socket, request) => {
    const tenant = resolveRelayTenantByHost(config.tenants, request?.headers?.['x-forwarded-host'] || request?.headers?.host || '')
    if (!tenant) {
      app.log.warn({ host: normalizeRelayHost(request?.headers?.host || request?.headers?.['x-forwarded-host'] || '') }, '[relay] WebSocket 连接未匹配到租户')
      socket.close(1008, 'invalid_tenant')
      return
    }

    const tenantState = getTenantState(tenant.key)
    let authenticated = false
    appendTenantEvent(tenant.key, 'socket_connected', {
      remoteAddress: request?.socket?.remoteAddress || '',
    })
    app.log.info({
      tenantKey: tenant.key,
      host: tenant.hosts[0] || '',
      remoteAddress: request?.socket?.remoteAddress || '',
    }, '[relay] 收到设备连接')
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        app.log.warn({ tenantKey: tenant.key, host: tenant.hosts[0] || '' }, '[relay] 设备认证超时，连接将被关闭')
        appendTenantEvent(tenant.key, 'auth_timeout')
        socket.close(1008, 'missing_auth')
      }
    }, DEVICE_AUTH_TIMEOUT_MS)

    socket.on('message', (payload, isBinary) => {
      if (isBinary) {
        return
      }

      let message
      try {
        message = JSON.parse(payload.toString('utf8'))
      } catch {
        return
      }

      if (!authenticated) {
        if (message.type !== 'hello') {
          app.log.warn({ tenantKey: tenant.key, host: tenant.hosts[0] || '' }, '[relay] 收到未认证设备的非法首包，连接将被关闭')
          appendTenantEvent(tenant.key, 'invalid_first_message')
          socket.close(1008, 'missing_hello')
          return
        }

        const providedToken = String(message.deviceToken || '').trim()
        const providedDeviceId = String(message.deviceId || '').trim()
        if (!constantTimeEqual(providedToken, tenant.deviceToken)) {
          appendTenantEvent(tenant.key, 'auth_rejected', {
            reason: 'invalid_token',
            deviceId: providedDeviceId || '',
          })
          app.log.warn({
            tenantKey: tenant.key,
            host: tenant.hosts[0] || '',
            deviceId: providedDeviceId || 'unknown-device',
          }, '[relay] 设备令牌不匹配，连接将被拒绝')
          socket.close(1008, 'invalid_token')
          return
        }
        if (tenant.expectedDeviceId && providedDeviceId !== tenant.expectedDeviceId) {
          appendTenantEvent(tenant.key, 'auth_rejected', {
            reason: 'invalid_device',
            deviceId: providedDeviceId || '',
          })
          app.log.warn({
            tenantKey: tenant.key,
            host: tenant.hosts[0] || '',
            expectedDeviceId: tenant.expectedDeviceId,
            providedDeviceId: providedDeviceId || 'unknown-device',
          }, '[relay] 设备 ID 不匹配，连接将被拒绝')
          socket.close(1008, 'invalid_device')
          return
        }

        authenticated = true
        clearTimeout(authTimer)

        if (tenantState?.socket && tenantState.socket !== socket) {
          appendTenantEvent(tenant.key, 'replaced_by_new_connection', {
            deviceId: providedDeviceId || '',
          })
          app.log.warn({
            tenantKey: tenant.key,
            host: tenant.hosts[0] || '',
            deviceId: providedDeviceId || 'unknown-device',
          }, '[relay] 当前租户已有旧设备连接，将被新连接替换')
          tenantState.socket.close(1012, 'replaced_by_new_connection')
        }

        if (tenantState) {
          tenantState.socket = socket
          tenantState.deviceId = providedDeviceId
          tenantState.connectedAt = new Date().toISOString()
          tenantState.lastHeartbeatAt = tenantState.connectedAt
          tenantState.lastDisconnectedAt = ''
          tenantState.lastDisconnectCode = 0
          tenantState.lastDisconnectReason = ''
          tenantState.version = String(message.version || '').trim()
        }
        usageStore.record({
          tenantKey: tenant.key,
          type: 'connect',
          host: tenant.hosts[0] || '',
          deviceId: providedDeviceId || '',
        })
        appendTenantEvent(tenant.key, 'auth_ok', {
          deviceId: providedDeviceId || '',
          version: String(message.version || '').trim(),
        })
        socket.send(JSON.stringify({
          type: 'hello.ack',
          ok: true,
          deviceId: providedDeviceId,
          tenantKey: tenant.key,
        }))
        app.log.info({
          tenantKey: tenant.key,
          host: tenant.hosts[0] || '',
          deviceId: providedDeviceId || 'unknown-device',
        }, '[relay] 设备已连接')
        return
      }

      const record = requestMap.get(String(message.requestId || ''))
      if (!record || record.tenantKey !== tenant.key) {
        return
      }

      if (message.type === 'response.start') {
        writeRelayResponseStart(record, message)
        return
      }

      if (message.type === 'response.body') {
        writeRelayResponseBody(record, message)
        return
      }

      if (message.type === 'response.end') {
        requestMap.delete(record.requestId)
        finalizeRelayResponse(record)
        return
      }

      if (message.type === 'response.error') {
        requestMap.delete(record.requestId)
        failRelayRequest(record, 502, message.message || '本地 PromptX 响应失败。')
      }
    })

    socket.on('pong', () => {
      if (tenantState?.socket !== socket) {
        return
      }
      tenantState.lastHeartbeatAt = new Date().toISOString()
    })

    socket.on('error', (error) => {
      appendTenantEvent(tenant.key, 'socket_error', {
        deviceId: tenantState?.deviceId || '',
        authenticated,
        error: error?.message || String(error || ''),
      })
      app.log.warn({
        tenantKey: tenant.key,
        host: tenant.hosts[0] || '',
        deviceId: tenantState?.deviceId || 'unknown-device',
        authenticated,
        error: error?.message || String(error || ''),
      }, '[relay] 设备连接异常')
    })

    socket.on('close', (code, reason) => {
      const closeReason = reason?.toString('utf8') || ''
      clearTimeout(authTimer)
      if (tenantState?.socket === socket) {
        const disconnectedRequestIds = [...requestMap.keys()].filter((requestId) => requestMap.get(requestId)?.tenantKey === tenant.key)
        const disconnectedDeviceId = tenantState.deviceId || ''
        disconnectedRequestIds.forEach((requestId) => {
          const record = requestMap.get(requestId)
          requestMap.delete(requestId)
          if (record) {
            failRelayRequest(record, 503, 'PromptX 本地设备已断开。')
          }
        })
        tenantState.socket = null
        tenantState.deviceId = ''
        tenantState.connectedAt = ''
        tenantState.lastDisconnectedAt = new Date().toISOString()
        tenantState.lastDisconnectCode = Number(code || 0)
        tenantState.lastDisconnectReason = closeReason
        tenantState.version = ''
        appendTenantEvent(tenant.key, 'socket_closed', {
          deviceId: disconnectedDeviceId,
          code: Number(code || 0),
          reason: closeReason || '',
        })
        app.log.warn({
          tenantKey: tenant.key,
          host: tenant.hosts[0] || '',
          code: Number(code || 0),
          reason: closeReason || 'none',
        }, '[relay] 设备已断开')
      } else if (!authenticated) {
        appendTenantEvent(tenant.key, 'socket_closed_before_auth', {
          code: Number(code || 0),
          reason: closeReason || '',
        })
        app.log.warn({
          tenantKey: tenant.key,
          host: tenant.hosts[0] || '',
          code: Number(code || 0),
          reason: closeReason || 'none',
        }, '[relay] 未认证设备连接已关闭')
      }
    })
  })

  app.server.on('upgrade', (request, socket, head) => {
    const pathname = String(request.url || '').split('?')[0]
    if (pathname !== '/relay/connect') {
      socket.destroy()
      return
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request)
    })
  })

  await app.listen({ host: config.host, port: config.port })
  const resolvedAddress = app.server.address()
  const resolvedPort = typeof resolvedAddress === 'object' && resolvedAddress ? resolvedAddress.port : config.port

  const accessUrl = `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${resolvedPort}`
  app.log.info(`promptx relay running at ${accessUrl}`)
  app.log.info(`[relay] 已加载 ${config.tenants.length} 个租户，来源：${config.tenantSource}`)
  app.log.info({ usageFile: usageStore.filePath }, '[relay] 租户使用统计已启用')
  if (config.adminToken) {
    app.log.info({ adminPath: '/relay/admin/usage' }, '[relay] 管理统计页面已启用')
  } else {
    app.log.warn({ adminPath: '/relay/admin/usage' }, '[relay] 管理统计页面未配置口令，当前可直接访问')
  }
  app.log.info({
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
  }, '[relay] 心跳检测已启用')
  config.tenants.forEach((tenant) => {
    app.log.info({
      tenantKey: tenant.key,
      hosts: tenant.hosts,
      expectedDeviceId: tenant.expectedDeviceId || '',
      accessTokenEnabled: Boolean(tenant.accessToken),
    }, '[relay] 租户已就绪，等待本地 PromptX 接入')
  })

  return {
    app,
    config,
    port: resolvedPort,
    async close() {
      clearInterval(heartbeatTimer)
      usageStore.flush?.()
      await new Promise((resolve) => {
        try {
          wsServer.close(() => resolve())
        } catch {
          resolve()
        }
      })
      await app.close()
    },
  }
}

export {
  normalizeRelayHost,
  normalizeRelayTenantConfig,
  normalizeRequestBodyToBuffer,
  readRelayServerConfig,
  resolveRelayTenantByHost,
  startRelayServer,
}
