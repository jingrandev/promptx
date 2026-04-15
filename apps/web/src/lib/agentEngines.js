import {
  AGENT_ENGINE_OPTIONS,
  getAgentEngineLabel,
  normalizeAgentEngine,
} from '../../../../packages/shared/src/index.js'
import { request } from './request.js'

export { AGENT_ENGINE_OPTIONS, getAgentEngineLabel, normalizeAgentEngine }

export function normalizeAgentEngineOptions(items = []) {
  const source = Array.isArray(items) && items.length ? items : AGENT_ENGINE_OPTIONS

  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const value = normalizeAgentEngine(item.value)
      return {
        ...item,
        value,
        label: String(item.label || getAgentEngineLabel(value)).trim() || getAgentEngineLabel(value),
        enabled: item.enabled !== false,
        available: item.available !== false,
      }
    })
}

export function getEnabledAgentEngineOptions(items = []) {
  return normalizeAgentEngineOptions(items).filter((item) => item.enabled && item.available)
}

export async function fetchEnabledAgentEngineOptions() {
  const payload = await request('/api/meta', {
    cache: 'no-store',
  })

  return getEnabledAgentEngineOptions(payload?.agentEngineOptions)
}

export function formatAgentBindingLabel(item = {}, options = {}) {
  const {
    defaultLabel = '默认',
    prefix = '',
  } = options

  const label = getAgentEngineLabel(item?.engine)
  const baseLabel = `${String(prefix || '')}${label}`

  return item?.isDefault ? `${baseLabel} · ${defaultLabel}` : baseLabel
}
