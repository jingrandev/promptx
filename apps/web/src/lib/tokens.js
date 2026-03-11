const STORAGE_KEY = 'tmpprompt:edit-tokens'

function readStore() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getEditToken(slug) {
  return readStore()[slug] || ''
}

export function setEditToken(slug, token) {
  const current = readStore()
  current[slug] = token
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
}

export function removeEditToken(slug) {
  const current = readStore()
  delete current[slug]
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
}
