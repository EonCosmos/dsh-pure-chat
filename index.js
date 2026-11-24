/**
 * Pure chat: hide every host-global tool from the agents that select the
 * `pure-chat` preset, while keeping the preset's own two web tools visible.
 *
 * `ctx.tools.restrict()` masks inherited tools by name, and this row denies the
 * global registry explicitly. `{ allow: [] }` cannot express "inherit nothing":
 * the registry rejects an empty filter, and an allow list may only name global
 * tools that already exist. Scoped registrations from the preset (web_search,
 * web_fetch) have names of their own and stay visible either way.
 *
 * The deny list is re-derived on every `tools/change` instead of being
 * snapshotted once, so a global tool registered after this preset activated (a
 * plugin installed later, an HMR reload) cannot leak into its sessions.
 */

import { registerClearContext } from './lib/clear-context.js'
import { registerWriteFile } from './lib/write-file.js'

export const name = 'pure-chat'

export const inject = ['tools']

/**
 * Reserved PTC presentation transport. The registry refuses to restrict it, so
 * it is never named in a deny list; a preset that mounts no PTC executor cannot
 * execute it anyway.
 */
const RESERVED_TOOL = 'run_code'

/**
 * Read the global view: the tools every agent would inherit if this preset did
 * not hide them. Scoped registrations are not part of it.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the preset composition scope.
 * @returns the restrictable global tool names, in registry order.
 */
function globalToolNames(ctx) {
  return ctx.tools
    .definitions()
    .map(definition => definition.name)
    .filter(name => name !== RESERVED_TOOL)
}

/**
 * Compare two name lists as sets; the registry keeps names unique.
 * @param {readonly string[]} left - first list.
 * @param {readonly string[]} right - second list.
 * @returns whether both carry the same names.
 */
function sameNames(left, right) {
  if (left.length !== right.length) return false
  const seen = new Set(right)
  return left.every(name => seen.has(name))
}

/**
 * Deny the host-global tool names for this preset's scope.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the preset composition scope.
 */
function hideGlobalTools(ctx) {
  /** Global names the restriction currently held by this plugin denies. */
  let denied = []
  /** Lifts that restriction; replaced whenever the deny list changes. */
  let release = () => {}

  const fail = (error, fatal) => {
    const message = `pure-chat: could not hide host-global tools: ${String(error)}`
    ctx.logger?.error?.(message)
    // A preset whose whole purpose is hiding tools must not start as an agent
    // with every tool: refuse to compose it, so the broken row is visible.
    if (fatal) throw new Error(message, { cause: error })
  }

  const hide = fatal => {
    let names
    try {
      names = globalToolNames(ctx)
    } catch (error) {
      fail(error, fatal)
      return
    }
    if (sameNames(names, denied)) return

    const previousDenied = denied
    const previousRelease = release
    // Claim the new set before touching the registry: `restrict()` and the
    // disposer both emit `tools/change`, and a reentrant pass must see the claim
    // and stop instead of applying the same restriction again.
    denied = names
    release = () => {}

    if (names.length === 0) {
      previousRelease()
      return
    }

    let next
    try {
      next = ctx.tools.restrict({ deny: names })
    } catch (error) {
      denied = previousDenied
      release = previousRelease
      fail(error, fatal)
      return
    }
    release = next
    previousRelease()
  }

  ctx.effect(() => {
    hide(true)
    const off = ctx.on('tools/change', () => hide(false))
    return () => {
      off()
      release()
      release = () => {}
      denied = []
    }
  }, 'pure-chat.hideGlobalTools()')
}

/**
 * The preset's whole contribution: hide the host-global tools, mount the
 * `write_file` tool, and register the `/clear-context` command.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the preset composition scope.
 */
export function apply(ctx) {
  hideGlobalTools(ctx)
  registerWriteFile(ctx)
  registerClearContext(ctx)
}
