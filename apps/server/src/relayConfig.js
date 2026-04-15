import fs from 'node:fs'
import path from 'node:path'

import { ensurePromptxStorageReady } from './appPaths.js'

const RELAY_CONFIG_FILE = 'relay-config.json'

function getRelayConfigPath() {
  const { dataDir } = ensurePromptxStorageReady()
  return path.join(dataDir, RELAY_CONFIG_FILE)
}

function normalizeRelayConfig(input = {}) {
  const relayUrl = String(input?.relayUrl || '').trim()
  const deviceId = String(input?.deviceId || '').trim()
  const deviceToken = String(input?.deviceToken || '').trim()
  const allowRemoteShell = typeof input?.allowRemoteShell === 'boolean'
    ? input.allowRemoteShell
    : ['1', 'true', 'on', 'yes'].includes(String(input?.allowRemoteShell || '').trim().toLowerCase())
  const enabled = typeof input?.enabled === 'boolean'
    ? input.enabled
    : !['0', 'false', 'off', 'no'].includes(String(input?.enabled || '').trim().toLowerCase())

  return {
    relayUrl,
    deviceId,
    deviceToken,
    allowRemoteShell,
    enabled: Boolean(enabled && relayUrl && deviceId && deviceToken),
  }
}

function readStoredRelayConfig() {
  const filePath = getRelayConfigPath()

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return normalizeRelayConfig(payload)
  } catch {
    return normalizeRelayConfig()
  }
}

function writeStoredRelayConfig(input = {}) {
  const filePath = getRelayConfigPath()
  const normalized = normalizeRelayConfig(input)
  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

function getRelayConfigForClient() {
  const stored = readStoredRelayConfig()
  const relayUrl = String(process.env.PROMPTX_RELAY_URL || stored.relayUrl || '').trim()
  const deviceId = String(process.env.PROMPTX_RELAY_DEVICE_ID || stored.deviceId || '').trim()
  const deviceToken = String(process.env.PROMPTX_RELAY_DEVICE_TOKEN || stored.deviceToken || '').trim()
  const envAllowRemoteShell = String(process.env.PROMPTX_RELAY_ALLOW_REMOTE_SHELL || '').trim()
  const envEnabled = String(process.env.PROMPTX_RELAY_ENABLED || '').trim()
  const managedByEnv = isRelayConfigManagedByEnv()
  const enabled = envEnabled
    ? !['0', 'false', 'off', 'no'].includes(envEnabled.toLowerCase())
    : managedByEnv
      ? Boolean(relayUrl && deviceId && deviceToken)
      : Boolean(stored.enabled)
  const allowRemoteShell = envAllowRemoteShell
    ? ['1', 'true', 'on', 'yes'].includes(envAllowRemoteShell.toLowerCase())
    : Boolean(stored.allowRemoteShell)

  return normalizeRelayConfig({
    relayUrl,
    deviceId,
    deviceToken,
    allowRemoteShell,
    enabled,
  })
}

function isRelayConfigManagedByEnv() {
  return Boolean(
    String(process.env.PROMPTX_RELAY_URL || '').trim()
    || String(process.env.PROMPTX_RELAY_DEVICE_ID || '').trim()
    || String(process.env.PROMPTX_RELAY_DEVICE_TOKEN || '').trim()
    || String(process.env.PROMPTX_RELAY_ALLOW_REMOTE_SHELL || '').trim()
    || String(process.env.PROMPTX_RELAY_ENABLED || '').trim()
  )
}

export {
  getRelayConfigForClient,
  getRelayConfigPath,
  isRelayConfigManagedByEnv,
  normalizeRelayConfig,
  readStoredRelayConfig,
  writeStoredRelayConfig,
}
