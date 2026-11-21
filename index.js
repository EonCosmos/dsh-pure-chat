/**
 * Pure chat: hide every host-global tool from the agents that select the
 * `pure-chat` preset, while keeping the preset's own two web tools visible.
 *
 * `ctx.tools.restrict()` masks inherited tools by name. An `allow: []` mask
 * would also hide the preset's own scoped registrations, so this row denies the
 * global registry explicitly instead. Scoped registrations from the preset
 * (web_search, web_fetch) have names of their own and stay visible.
 */

export const name = 'pure-chat'

export const inject = ['tools']

/**
 * Deny the host-global tool names for this preset's scope.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the preset composition scope.
 */
export function apply(ctx) {
  ctx.effect(() => {
    try {
      // Omitted scope reads the global view: the tools every agent would
      // inherit if this preset did not hide them.
      const inheritedGlobals = ctx.tools.definitions().map(definition => definition.name)
      return ctx.tools.restrict({ deny: inheritedGlobals })
    } catch (error) {
      // Never fail the preset because a foreign tool registry is unusual.
      ctx.logger?.warn?.(`pure-chat: could not hide global tools: ${String(error)}`)
      return () => {}
    }
  }, 'pure-chat.hideGlobalTools()')
}
