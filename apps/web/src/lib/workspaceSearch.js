export const WORKSPACE_PATH_SEARCH_DEBOUNCE_MS = 250
export const WORKSPACE_CONTENT_SEARCH_DEBOUNCE_MS = 350
export const WORKSPACE_PREVIEW_SELECTION_DEBOUNCE_MS = 180
export const WORKSPACE_SEARCH_MIN_QUERY_LENGTH = 2

export function isAbortError(error) {
  return error?.name === 'AbortError'
}

