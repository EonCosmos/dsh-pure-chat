/**
 * The `clear-context` command: start a fresh model context without touching the
 * conversation the user sees.
 *
 * A session derives the model's history from its ordered *surface*, so starting
 * over is one surface replacement: append a synthetic user message whose
 * `surfaceOp` shadows every conversational node, citing each shadowed node as a
 * source. The log keeps the earlier events — the transcript, the session file
 * and every earlier message stay exactly as they were — while the next request
 * derives only the fresh message. The rendered page hides replacement nodes and
 * renders only appended user messages, so nothing appears in the chat either.
 *
 * @module dsh-pure-chat/clear-context
 */

import { randomUUID } from 'node:crypto'

/** Human command name; the UI calls it as `/clear-context`. */
export const COMMAND_NAME = 'clear-context'

const COMMAND_DESCRIPTION = 'Clear the model context. The conversation you see stays untouched; only what the model reads from now on is reset.'

/**
 * The one message the cleared context starts from. It is model-facing text, so
 * it states the situation plainly and gives no instructions of its own.
 */
const NOTICE = 'Earlier conversation context was cleared by the user. This message is the new starting point of the conversation; continue from the next user message.'

/**
 * Replace the conversational part of one session's surface with a single fresh
 * user message. Surface node 0 is kept when it holds the system prompt.
 * @param {import('@deepseek-ai/cordis').Context} ctx - preset composition scope.
 * @param {object} agent - the agent whose session is cleared.
 * @returns {{kind: 'success', text: string} | {kind: 'error', text: string}} the command result.
 */
export function clearContext(ctx, agent) {
  const session = agent?.session
  if (session === undefined) return { kind: 'error', text: 'This conversation has no live session to clear.' }

  const boundary = ctx.get('agents')?.turnBoundaryOf(session)
  if (boundary !== undefined && boundary.openTurnStartSeq !== null) {
    return { kind: 'error', text: 'Wait for the current answer to finish (or stop it) before clearing the context.' }
  }

  const nodes = session.surface.nodes
  const head = nodes.length === 0 ? undefined : session.eventAt(nodes[0])
  const firstIndex = head?.type === 'system/message' ? 1 : 0
  const shadowed = nodes.slice(firstIndex)
  if (shadowed.length === 0) {
    return { kind: 'success', text: 'The context is already empty.' }
  }

  const message = {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: NOTICE }],
    source: { kind: 'user' },
  }

  try {
    session.append('user/message', message, {
      surfaceOp: { op: 'replace', startSeq: shadowed[0], endSeq: shadowed[shadowed.length - 1] },
      sourceEventSeqs: shadowed,
    })
  } catch (error) {
    return { kind: 'error', text: `Could not clear the context: ${String(error)}` }
  }

  return { kind: 'success', text: 'Context cleared. The conversation above is unchanged and the next message starts from a fresh context.' }
}

/**
 * Register the command inside this preset's scope, so it exists only for agents
 * that selected the preset.
 * @param {import('@deepseek-ai/cordis').Context} ctx - preset composition scope.
 */
export function registerClearContext(ctx) {
  const commands = ctx.get('commands')
  if (commands === undefined) return
  ctx.effect(() => commands.register({
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    handler: invocation => clearContext(ctx, invocation.agent),
  }), 'pure-chat.clearContext()')
}
