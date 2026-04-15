import { spawn } from 'node:child_process'
import {
  createAgentEventEnvelopeEvent,
  createCompletedEnvelopeEvent,
  createStderrEnvelopeEvent,
  createStdoutEnvelopeEvent,
} from '../../../../packages/shared/src/agentRunEnvelopeEvents.js'
import {
  AGENT_RUN_EVENT_TYPES,
  AGENT_RUN_ITEM_TYPES,
  createItemCompletedEvent,
  createItemStartedEvent,
} from '../../../../packages/shared/src/agentRunEvents.js'
import { createManagedSpawnOptions, forceStopChildProcess } from '../processControl.js'

const SHELL_ENGINE = 'shell'
const MAX_SHELL_OUTPUT_TAIL_LENGTH = Math.max(
  16 * 1024,
  Number(process.env.PROMPTX_SHELL_OUTPUT_TAIL_LENGTH) || 128 * 1024
)

function appendOutputTail(current = '', chunk = '', maxLength = MAX_SHELL_OUTPUT_TAIL_LENGTH) {
  const next = `${String(current || '')}${String(chunk || '')}`
  if (next.length <= maxLength) {
    return next
  }
  return next.slice(next.length - maxLength)
}

function splitBufferedLines(buffer = '') {
  const normalized = String(buffer || '')
  if (!normalized) {
    return { lines: [], rest: '' }
  }

  const parts = normalized.split(/\r?\n/g)
  const rest = /(?:\r?\n)$/.test(normalized) ? '' : parts.pop() || ''
  return {
    lines: parts.filter(Boolean),
    rest,
  }
}

function getShellCommand(command = '') {
  const raw = String(command || '').trim()
  if (!raw) {
    return {
      executable: '',
      args: [],
      displayCommand: '',
    }
  }

  if (process.platform === 'win32') {
    const executable = process.env.ComSpec || 'cmd.exe'
    return {
      executable,
      args: ['/d', '/s', '/c', raw],
      displayCommand: `${executable} /d /s /c ${raw}`,
    }
  }

  const executable = process.env.SHELL || '/bin/zsh'
  return {
    executable,
    args: ['-lc', raw],
    displayCommand: `${executable} -lc ${raw}`,
  }
}

function createCommandItem(command = '', status = 'running', aggregatedOutput = '', exitCode = null) {
  return {
    type: AGENT_RUN_ITEM_TYPES.COMMAND_EXECUTION,
    command: String(command || '').trim(),
    status: String(status || '').trim() || 'running',
    aggregated_output: String(aggregatedOutput || ''),
    ...(typeof exitCode === 'number' ? { exit_code: exitCode } : {}),
  }
}

export const shellRunner = {
  engine: SHELL_ENGINE,
  label: 'Shell',
  supportsWorkspaceHistory: false,
  streamSessionPrompt(session, prompt, callbacks = {}) {
    const command = String(prompt || '').trim()
    if (!command) {
      throw new Error('缺少要执行的命令。')
    }

    const cwd = String(session?.cwd || '').trim()
    const { executable, args, displayCommand } = getShellCommand(command)
    if (!executable) {
      throw new Error('当前环境没有可用的 shell。')
    }

    const onEvent = typeof callbacks.onEvent === 'function' ? callbacks.onEvent : () => {}
    const child = spawn(executable, args, createManagedSpawnOptions({ cwd }))
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let outputTail = ''
    let settled = false

    onEvent(createAgentEventEnvelopeEvent(createItemStartedEvent(createCommandItem(displayCommand, 'running'))))

    const result = new Promise((resolve, reject) => {
      const rejectWithOutput = (message, payload = {}) => {
        const error = new Error(String(message || '命令执行失败。'))
        error.output = String(payload.output || outputTail || '').trim()
        error.exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null
        reject(error)
      }

      const flushStdout = (buffer, force = false) => {
        const { lines, rest } = splitBufferedLines(buffer)
        lines.forEach((line) => {
          onEvent(createStdoutEnvelopeEvent(line))
          outputTail = appendOutputTail(outputTail, `${line}\n`)
        })
        if (force && rest) {
          onEvent(createStdoutEnvelopeEvent(rest))
          outputTail = appendOutputTail(outputTail, `${rest}\n`)
          return ''
        }
        return rest
      }

      const flushStderr = (buffer, force = false) => {
        const { lines, rest } = splitBufferedLines(buffer)
        lines.forEach((line) => {
          onEvent(createStderrEnvelopeEvent(line))
          outputTail = appendOutputTail(outputTail, `${line}\n`)
        })
        if (force && rest) {
          onEvent(createStderrEnvelopeEvent(rest))
          outputTail = appendOutputTail(outputTail, `${rest}\n`)
          return ''
        }
        return rest
      }

      child.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        stdoutBuffer = flushStdout(stdoutBuffer)
      })

      child.stderr?.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        stderrBuffer = flushStderr(stderrBuffer)
      })

      child.once('error', (error) => {
        if (settled) {
          return
        }
        settled = true
        stdoutBuffer = flushStdout(stdoutBuffer, true)
        stderrBuffer = flushStderr(stderrBuffer, true)
        const finalOutput = String(outputTail || '').trim()
        onEvent(createAgentEventEnvelopeEvent(createItemCompletedEvent(createCommandItem(
          displayCommand,
          'failed',
          finalOutput,
          1
        ))))
        rejectWithOutput(error?.message || '命令启动失败。', {
          output: finalOutput,
          exitCode: 1,
        })
      })

      child.once('close', (code, signal) => {
        if (settled) {
          return
        }
        settled = true
        stdoutBuffer = flushStdout(stdoutBuffer, true)
        stderrBuffer = flushStderr(stderrBuffer, true)
        const exitCode = Number.isInteger(code) ? code : (signal ? 1 : 0)
        const finalOutput = String(outputTail || '').trim()
        const success = exitCode === 0

        onEvent(createAgentEventEnvelopeEvent(createItemCompletedEvent(createCommandItem(
          displayCommand,
          success ? 'completed' : 'failed',
          finalOutput,
          exitCode
        ))))

        if (success) {
          const message = finalOutput || `命令执行完成：${command}`
          onEvent(createCompletedEnvelopeEvent(message))
          resolve({
            sessionId: String(session?.id || '').trim(),
            threadId: '',
            message,
          })
          return
        }

        rejectWithOutput(`命令执行失败(exit ${exitCode})`, {
          output: finalOutput,
          exitCode,
        })
      })
    })

    return {
      child,
      result,
      cancel(options = {}) {
        forceStopChildProcess(child, options)
      },
    }
  },
}
