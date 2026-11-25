/**
 * Display text for the `pure-chat` preset, chosen per host language.
 *
 * DSH never translates user-authored preset metadata: the client renders
 * `preset.name` verbatim, and only the shipped presets resolve through locale
 * dictionaries. A single string therefore has to pick one language, so the host
 * registers the preset with the text of the active language instead of shipping
 * a mixed label.
 *
 * @module dsh-pure-chat/preset-text
 */

/** Preset copy, one language per entry. */
export const PRESET_TEXT = {
  zh: {
    name: '纯对话',
    description: '直接和模型对话，可联网搜索、读取网页、导出文件；没有系统提示词，也没有文件、命令、技能或子代理工具。',
  },
  en: {
    name: 'Pure chat',
    description: 'Plain chat with web search, web fetch and file export; no system prompt and no file, shell, skill, or subagent tools.',
  },
}

/**
 * Read the explicit DSH language setting, when the host exposes one.
 * The value must look like a language id, so another plugin's `preference`
 * field (a theme mode, for example) is ignored.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin scope.
 * @returns {'zh' | 'en' | undefined} the requested language, if any.
 */
function settingsLanguage(ctx) {
  const settings = ctx.get('settings')
  if (settings === undefined || typeof settings.describe !== 'function') return undefined
  let descriptors
  try {
    descriptors = settings.describe({ redactSecrets: true })
  } catch {
    return undefined
  }
  for (const descriptor of descriptors ?? []) {
    const value = descriptor?.value
    if (value === null || typeof value !== 'object') continue
    const preference = value.preference
    if (typeof preference !== 'string') continue
    const normalized = preference.toLowerCase()
    if (normalized.startsWith('zh')) return 'zh'
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  }
  return undefined
}

/**
 * Resolve the language the preset text should use: an explicit DSH language
 * setting first, then the host locale, then English.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin scope.
 * @returns {'zh' | 'en'} the language for preset copy.
 */
export function presetLanguage(ctx) {
  const configured = settingsLanguage(ctx)
  if (configured !== undefined) return configured
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * Copy for the preset in the given language.
 * @param {'zh' | 'en'} language - resolved language.
 * @returns {{name: string, description: string}} preset display text.
 */
export function presetText(language) {
  return PRESET_TEXT[language] ?? PRESET_TEXT.en
}
