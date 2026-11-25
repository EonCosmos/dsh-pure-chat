/**
 * Host half of the dsh-pure-chat bundle.
 *
 * Two jobs:
 *
 * 1. It is the package's own top-level Loader row. The Web client serves a
 *    package's `dsh.client` bundle only for a profile-tree entry named after that
 *    package, and an entry mounted inside a preset's tree is never scanned — so
 *    this row is what puts the clear-context control into the page.
 * 2. It registers the `pure-chat` preset with display text in the host language.
 *    DSH never translates user-authored preset metadata, so a single declaration
 *    cannot follow the language; registering it here keeps the label free of a
 *    mixed `中文 (English)` string. The scoped behavior still lives in
 *    `./preset.js`, mounted by this preset's composition.
 */

import { PRESET_ORDER, PRESET_PLUGINS } from './lib/preset-composition.js'
import { presetLanguage, presetText } from './lib/preset-text.js'

export const name = 'dsh-pure-chat'

export const inject = ['agentPresets', 'systemPrompt', 'tools']

/**
 * Register the preset under the name the host language asks for.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin scope.
 */
export async function apply(ctx) {
  const text = presetText(presetLanguage(ctx))
  const dispose = await ctx.agentPresets.register({
    id: 'pure-chat',
    name: text.name,
    description: text.description,
    order: PRESET_ORDER,
    plugins: PRESET_PLUGINS.map(plugin => ({ ...plugin })),
  })
  ctx.effect(() => dispose)
}
