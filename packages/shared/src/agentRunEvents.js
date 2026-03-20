export const AGENT_RUN_EVENT_TYPES = {
  THREAD_STARTED: 'thread.started',
  TURN_STARTED: 'turn.started',
  TURN_COMPLETED: 'turn.completed',
  TURN_FAILED: 'turn.failed',
  ERROR: 'error',
  ITEM_STARTED: 'item.started',
  ITEM_UPDATED: 'item.updated',
  ITEM_COMPLETED: 'item.completed',
}

export const AGENT_RUN_ITEM_TYPES = {
  REASONING: 'reasoning',
  WEB_SEARCH: 'web_search',
  COLLAB_TOOL_CALL: 'collab_tool_call',
  FILE_CHANGE: 'file_change',
  COMMAND_EXECUTION: 'command_execution',
  TODO_LIST: 'todo_list',
  AGENT_MESSAGE: 'agent_message',
}

export function createAgentRunEvent(type = '', payload = {}) {
  return {
    type: String(type || '').trim(),
    ...(payload && typeof payload === 'object' ? payload : {}),
  }
}

export function createThreadStartedEvent(threadId = '') {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.THREAD_STARTED, {
    thread_id: String(threadId || '').trim(),
  })
}

export function createTurnCompletedEvent(payload = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.TURN_COMPLETED, payload)
}

export function createTurnFailedEvent(payload = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.TURN_FAILED, payload)
}

export function createErrorEvent(message = '', payload = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.ERROR, {
    message: String(message || '').trim(),
    ...(payload && typeof payload === 'object' ? payload : {}),
  })
}

export function createItemStartedEvent(item = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.ITEM_STARTED, { item })
}

export function createItemUpdatedEvent(item = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.ITEM_UPDATED, { item })
}

export function createItemCompletedEvent(item = {}) {
  return createAgentRunEvent(AGENT_RUN_EVENT_TYPES.ITEM_COMPLETED, { item })
}
