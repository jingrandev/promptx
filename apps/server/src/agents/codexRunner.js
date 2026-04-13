import { AGENT_ENGINES, getAgentEngineLabel } from '../../../../packages/shared/src/index.js'
import {
  listKnownCodexSessions,
  listKnownCodexWorkspaces,
  streamPromptToCodexSession,
} from '../codex.js'

export const codexRunner = {
  engine: AGENT_ENGINES.CODEX,
  label: getAgentEngineLabel(AGENT_ENGINES.CODEX),
  supportsWorkspaceHistory: true,
  listKnownWorkspaces(limit) {
    return listKnownCodexWorkspaces(limit)
  },
  listKnownSessions(options = {}) {
    return listKnownCodexSessions(options)
  },
  streamSessionPrompt(session, prompt, callbacks = {}) {
    return streamPromptToCodexSession(session, prompt, callbacks)
  },
}
