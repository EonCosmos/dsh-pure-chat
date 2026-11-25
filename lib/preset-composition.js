/**
 * Composition of the `pure-chat` preset, in the same shape a patch declaration
 * carries: the empty complete persona, the two web tools, and the scoped half
 * that hides host-global tools, mounts `write_file`, and registers
 * `/clear-context`.
 *
 * @module dsh-pure-chat/preset-composition
 */

/** Preset child rows, in activation order. */
export const PRESET_PLUGINS = [
  {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: {
      prefix: '',
      complete: true,
      includeRuntimeContext: false,
    },
  },
  {
    id: 'web',
    name: '@deepseek-ai/dsh-tool-web',
    config: {
      search: true,
      fetch: true,
    },
  },
  {
    id: 'pure-chat',
    name: 'dsh-pure-chat/preset',
  },
]

/** Roster position: after the shipped presets (standard 1, ptc 2, minimal 3, cordis 4). */
export const PRESET_ORDER = 5
