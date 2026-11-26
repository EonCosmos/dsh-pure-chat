/**
 * Client half of the pure-chat bundle. Two independent contributions:
 *
 * 1. A "clear context" control left of the composer's submit action. It
 *    confirms with the person, then invokes the Host command `/clear-context`,
 *    which owns the actual session-surface work. It renders only in sessions
 *    whose agent carries that command.
 * 2. A question jumper in the Session header: a dropdown listing the opening
 *    characters of every question in the loaded transcript, where picking a row
 *    scrolls the Chat view to that message. The rows come from the Chat
 *    snapshot's Turn navigation projection, so every preview is the host's own
 *    bounded, whitespace-normalized question text and every listed Turn has a
 *    loaded row to land on.
 */
window.__ModuleLoader__.load({
  id: 'dsh-pure-chat',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useCallback, useEffect, useId, useRef, useState } = React

    /** Dictionary namespace owned by this plugin. */
    const NS = 'pure-chat'

    /** Composer slot for the clear-context control. */
    const CLEAR_SLOT = 'conversation.input.right'
    /** Session-header slot for the question jumper. */
    const JUMPER_SLOT = 'conversation.session.header.actions'
    /** Ahead of the shipped agent-preset action (-10), so the control leads the row. */
    const JUMPER_ORDER = -20
    /** Characters of a question the dropdown shows before eliding the rest. */
    const HEAD_CHARS = 10
    /** Panel metrics, kept inside the viewport on small windows. */
    const MENU_WIDTH = 300
    const MENU_GAP = 6
    const MIN_MENU_HEIGHT = 140
    const MAX_MENU_HEIGHT = 360
    const SCROLL_GAP = 12
    const VIEWPORT_INSET = 12
    /** Host command that clears the context. */
    const COMMAND = '/clear-context'
    const COMMAND_NAME = 'clear-context'

    /** One shared empty list so an empty projection keeps one identity. */
    const EMPTY = Object.freeze([])

    /** Locale dictionaries; English completes the Chinese source of truth. */
    const DICTS = {
      zh: {
        'clear.title': '清空上下文',
        'clear.dialogTitle': '要清空当前对话的上下文吗？',
        'clear.dialogBody': '模型将从全新的上下文开始回答。上方的历史消息不会被修改或删除，仍可查看和复制。',
        'clear.cancel': '取消',
        'clear.confirm': '清空上下文',
        'clear.busy': '正在清空…',
        'clear.unavailable': '当前会话没有提供清空上下文的能力。',
        'clear.failed': '清空上下文失败。',
        'jumper.label': '跳转到提问',
        'jumper.title': '跳转到提问（{count} 个已加载）',
        'jumper.short': '提问',
        'jumper.header': '已加载的提问 · {count}',
        'jumper.item': '第 {turn} 轮：{text}',
        'jumper.missing': '没找到这条提问在正文里的位置：请切回「对话」视图后再试',
        'jumper.jumped': '已跳到第 {turn} 轮的提问',
      },
      en: {
        'clear.title': 'Clear context',
        'clear.dialogTitle': 'Clear this conversation’s context?',
        'clear.dialogBody': 'The model will start from a fresh context. The messages above stay as they are, so you can still read and copy them.',
        'clear.cancel': 'Cancel',
        'clear.confirm': 'Clear context',
        'clear.busy': 'Clearing…',
        'clear.unavailable': 'This conversation does not provide context clearing.',
        'clear.failed': 'Could not clear the context.',
        'jumper.label': 'Jump to a question',
        'jumper.title': 'Jump to a question ({count} loaded)',
        'jumper.short': 'Questions',
        'jumper.header': 'Loaded questions · {count}',
        'jumper.item': 'Turn {turn}: {text}',
        'jumper.missing': 'No transcript row to land on — switch back to the Chat view and try again',
        'jumper.jumped': 'Jumped to the question in turn {turn}',
      },
    }

    const JUMPER_CSS = `
.dsh-qj-root {
  display: inline-flex;
  align-items: center;
}
.dsh-qj-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 3px 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-qj-trigger:focus-visible {
  outline: none;
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-qj-trigger[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
@media (hover: hover) {
  .dsh-qj-trigger:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dsh-qj-glyph,
.dsh-qj-chevron {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}
.dsh-qj-glyph {
  width: 14px;
  height: 14px;
}
.dsh-qj-glyph > svg {
  width: 14px;
  height: 14px;
}
.dsh-qj-chevron > svg {
  width: 10px;
  height: 10px;
}
.dsh-qj-count {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dsh-qj-trigger[aria-expanded='true'] .dsh-qj-count {
  color: var(--dsw-alias-label-secondary);
}
/* The header row is shared with shipped actions: drop to the glyph alone where
   its own controls already collapse (the same width the job list uses). */
@container (max-width: 460px) {
  .dsh-qj-label,
  .dsh-qj-count {
    display: none;
  }
}
.dsh-qj-menu {
  position: fixed;
  z-index: 100;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 4px;
  margin: 0;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-menu-surface-fill, var(--dsw-specific-menu));
  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgb(0 0 0 / 0.16));
}
.dsh-qj-header {
  flex: none;
  padding: 5px 8px 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-qj-viewport {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dsh-qj-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-qj-row:focus-visible {
  outline: none;
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
@media (hover: hover) {
  .dsh-qj-row:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}
.dsh-qj-row[aria-current='true'] {
  background: var(--dsw-alias-interactive-bg-active);
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary));
}
@media (hover: hover) {
  .dsh-qj-row[aria-current='true']:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}
.dsh-qj-index {
  flex: none;
  min-width: 18px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
.dsh-qj-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-qj-notice {
  flex: none;
  padding: 6px 8px 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh-qj-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
`

    /**
     * Split text into user-perceived characters, so a flag or a ZWJ emoji
     * counts once instead of once per code point.
     * @param text - source text.
     * @returns the graphemes.
     */
    function graphemes(text) {
      if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
        try {
          const segments = []
          const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          for (const part of segmenter.segment(text)) segments.push(part.segment)
          return segments
        } catch {
          // Fall through to code points on engines that reject the locale-less form.
        }
      }
      return Array.from(text)
    }

    /**
     * Leading characters of a question, elided when it continues.
     * @param prompt - host preview of the Turn's question text.
     * @param limit - characters to keep.
     * @returns the visible label.
     */
    function headOf(prompt, limit) {
      if (typeof prompt !== 'string' || prompt === '') return ''
      const chars = graphemes(prompt)
      if (chars.length <= limit) return prompt
      return `${chars.slice(0, limit).join('').trimEnd()}…`
    }

    /**
     * Escape one value for a double-quoted attribute selector.
     * @param value - attribute value.
     * @returns the value, safe inside `[name="…"]`.
     */
    function attributeValue(value) {
      return String(value).replace(/["\\]/g, match => `\\${match}`)
    }

    /**
     * Nearest ancestor that actually scrolls its content.
     * @param from - element whose viewport is wanted.
     * @returns the scroll container, or null when the document scrolls instead.
     */
    function scrollableAncestor(from) {
      let node = from.parentElement
      while (node !== null && node !== document.body) {
        const style = getComputedStyle(node)
        const overflowY = style.overflowY
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
          && node.scrollHeight > node.clientHeight + 1) return node
        node = node.parentElement
      }
      return null
    }

    /** @returns the scroll behaviour the user's motion preference asks for. */
    function scrollBehavior() {
      const reduced = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches
      return reduced ? 'auto' : 'smooth'
    }

    /**
     * Reveal one Chat row by its Conversation key.
     * @param anchorKey - the key the Turn navigation projection reports.
     * @returns whether a row was found and scrolled to.
     */
    function reveal(anchorKey) {
      if (typeof anchorKey !== 'string' || anchorKey === '') return false
      const row = document.querySelector(`[data-chat-node-key="${attributeValue(anchorKey)}"]`)
      if (row === null) return false
      const behavior = scrollBehavior()
      const scroller = scrollableAncestor(row)
      if (scroller === null) {
        row.scrollIntoView({ block: 'start', behavior })
        return true
      }
      const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const top = Math.max(0, scroller.scrollTop + delta - SCROLL_GAP)
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior })
      else scroller.scrollTop = top
      return true
    }

    /**
     * Place the panel under its trigger, clamped inside the viewport.
     * @param trigger - the header button the panel belongs to.
     * @returns fixed-position geometry for the panel.
     */
    function placeMenu(trigger) {
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(MENU_WIDTH, Math.max(180, window.innerWidth - 2 * VIEWPORT_INSET))
      const left = Math.min(
        Math.max(VIEWPORT_INSET, rect.left),
        Math.max(VIEWPORT_INSET, window.innerWidth - width - VIEWPORT_INSET),
      )
      const top = rect.bottom + MENU_GAP
      const room = window.innerHeight - top - VIEWPORT_INSET
      return {
        left,
        top,
        width,
        maxHeight: Math.max(MIN_MENU_HEIGHT, Math.min(MAX_MENU_HEIGHT, room)),
      }
    }

    /** @param root - the panel element. @returns its focusable question rows. */
    function rowsOf(root) {
      if (root === null) return []
      return Array.from(root.querySelectorAll('[data-question-row]'))
    }

    /**
     * Bring one row inside the panel's own scrollport without moving the page.
     * @param viewport - the scrolling list.
     * @param row - the row to show.
     */
    function showRow(viewport, row) {
      if (viewport === null || row === null) return
      const viewportRect = viewport.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      if (rowRect.top < viewportRect.top) viewport.scrollTop += rowRect.top - viewportRect.top
      else if (rowRect.bottom > viewportRect.bottom) viewport.scrollTop += rowRect.bottom - viewportRect.bottom
    }

    // --- clear-context control -------------------------------------------------

    function buttonStyle(hovered) {
      return {
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 8,
        padding: 0,
        cursor: 'pointer',
        background: hovered ? 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06))' : 'transparent',
        color: 'var(--dsw-alias-label-secondary, #555)',
        lineHeight: 0,
      }
    }

    /**
     * Build the clear-context control bound to this plugin's context and translator.
     * @param ctx - client root context.
     * @param t - namespace-bound translate.
     * @returns the slot component.
     */
    function createClearControl(ctx, t) {
      return function ClearContextControl(props) {
        const sessionId = props.sessionId
        const [available, setAvailable] = React.useState(true)
        const [hovered, setHovered] = React.useState(false)
        const [open, setOpen] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState(null)

        React.useEffect(() => {
          if (sessionId === undefined) return undefined
          const commands = ctx.get('remote.commands')
          if (commands === undefined || typeof commands.list !== 'function') return undefined
          let cancelled = false
          const refresh = async () => {
            try {
              const result = await commands.list(sessionId)
              if (cancelled || result?.ok !== true) return
              const names = (result.value ?? []).map(descriptor => descriptor?.name)
              setAvailable(names.includes(COMMAND_NAME))
            } catch {
              // Leave the control visible: execution reports the real failure.
            }
          }
          refresh()
          // The preset's command can register after this control mounts, and a
          // session can switch presets, so follow the catalog's own signals.
          const offs = []
          const remote = ctx.get('remote')
          if (remote !== undefined && typeof remote.$on === 'function') {
            offs.push(remote.$on('commands/change', refresh))
            offs.push(remote.$on('agent-preset/selected', id => {
              if (id === sessionId) refresh()
            }))
          }
          return () => {
            cancelled = true
            for (const off of offs) {
              if (typeof off === 'function') off()
            }
          }
        }, [sessionId])

        React.useEffect(() => {
          if (!open) return undefined
          const onKeyDown = event => {
            if (event.key === 'Escape') setOpen(false)
          }
          window.addEventListener('keydown', onKeyDown)
          return () => window.removeEventListener('keydown', onKeyDown)
        }, [open])

        if (!available || sessionId === undefined) return null

        const close = () => {
          if (busy) return
          setOpen(false)
          setError(null)
        }

        const submit = async () => {
          setBusy(true)
          setError(null)
          try {
            const commands = ctx.get('remote.commands')
            if (commands === undefined || typeof commands.execute !== 'function') {
              setError(t('clear.unavailable'))
              return
            }
            const result = await commands.execute(sessionId, COMMAND, [])
            if (result?.ok !== true) {
              setError(result?.error?.message ?? t('clear.failed'))
              return
            }
            const execution = result.value
            if (execution === undefined) {
              setError(t('clear.unavailable'))
              return
            }
            if (execution.result?.kind === 'error') {
              setError(execution.result.text ?? t('clear.failed'))
              return
            }
            setOpen(false)
          } catch (failure) {
            setError(String(failure?.message ?? failure))
          } finally {
            setBusy(false)
          }
        }

        const icon = h('svg', {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        }, [
          h('path', { key: 'a', d: 'M20 20H9.6a2 2 0 0 1-1.4-.6l-4-4a2 2 0 0 1 0-2.8l7.4-7.4a2 2 0 0 1 2.8 0l4.6 4.6a2 2 0 0 1 0 2.8L11.4 20' }),
          h('path', { key: 'b', d: 'M7.5 13.5l5.5 5.5' }),
        ])

        const button = h('button', {
          type: 'button',
          title: t('clear.title'),
          'aria-label': t('clear.title'),
          onClick: () => {
            setError(null)
            setOpen(true)
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          style: buttonStyle(hovered),
        }, icon)

        if (!open) return button

        const dialog = h('div', {
          role: 'presentation',
          onClick: close,
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-drop, rgba(0,0,0,0.32))',
            padding: 16,
          },
        }, h('div', {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('clear.dialogTitle'),
          onClick: event => event.stopPropagation(),
          style: {
            width: 'min(420px, 100%)',
            background: 'var(--dsw-alias-bg-overlay, #ffffff)',
            color: 'var(--dsw-alias-label-primary, #1f2328)',
            border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.12))',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 12px 40px rgba(0,0,0,0.24)',
            font: 'inherit',
          },
        }, [
          h('div', { key: 'title', style: { fontSize: 15, fontWeight: 600, marginBottom: 8 } }, t('clear.dialogTitle')),
          h('div', {
            key: 'body',
            style: { fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #555)' },
          }, t('clear.dialogBody')),
          error === null ? null : h('div', {
            key: 'error',
            role: 'alert',
            style: { marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: 'var(--dsw-alias-state-error-primary, #d1242f)' },
          }, error),
          h('div', {
            key: 'actions',
            style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
          }, [
            h('button', {
              key: 'cancel',
              type: 'button',
              onClick: close,
              disabled: busy,
              style: {
                height: 32,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.12))',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary, #1f2328)',
                cursor: busy ? 'default' : 'pointer',
                fontSize: 13,
              },
            }, t('clear.cancel')),
            h('button', {
              key: 'confirm',
              type: 'button',
              onClick: submit,
              disabled: busy,
              style: {
                height: 32,
                padding: '0 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--dsw-alias-button-primary-fill, #1f6feb)',
                color: '#ffffff',
                cursor: busy ? 'default' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
              },
            }, busy ? t('clear.busy') : t('clear.confirm')),
          ]),
        ]))

        return h(React.Fragment, null, button, createPortal(dialog, document.body))
      }
    }

    // --- question jumper -------------------------------------------------------

    /**
     * Build the header control bound to this plugin instance's translator.
     * @param t - namespace-bound translate.
     * @returns the slot component.
     */
    function createJumperView(t) {
      /**
       * Header action: a compact trigger plus its portaled question list.
       * @param props - standard Session props; only the Chat selector is needed.
       * @returns the trigger and, while open, the portal.
       */
      return function QuestionJumper({ useChat }) {
        const items = useChat(snapshot => snapshot.navigation.items()) ?? EMPTY
        // A Turn whose loaded window starts mid-message reports an empty preview;
        // it is not a question anyone can recognize, so it stays out of the list.
        const questions = items.filter(item => typeof item.prompt === 'string' && item.prompt !== '')
        const [open, setOpen] = useState(false)
        const [place, setPlace] = useState(null)
        const [picked, setPicked] = useState(null)
        /** Why the last pick could not move the transcript, when it could not. */
        const [notice, setNotice] = useState(null)
        /** Polite announcement of the last landing. */
        const [announced, setAnnounced] = useState('')
        const rootRef = useRef(null)
        const triggerRef = useRef(null)
        const menuRef = useRef(null)
        const viewportRef = useRef(null)
        /** Which end of the list a keyboard opening should focus, then clear. */
        const focusTarget = useRef(null)
        const menuId = useId()

        const close = useCallback((restoreFocus) => {
          focusTarget.current = null
          setNotice(null)
          setOpen(false)
          if (restoreFocus === true) triggerRef.current?.focus({ preventScroll: true })
        }, [])

        const openMenu = useCallback((focus) => {
          const trigger = triggerRef.current
          if (trigger === null) return
          focusTarget.current = focus
          setNotice(null)
          setPlace(placeMenu(trigger))
          setOpen(true)
        }, [])

        const pick = useCallback((item) => {
          // Keep the list open when the transcript has no row to land on: the
          // reader stays where they were and sees why nothing moved.
          if (reveal(item.anchorKey) === false) {
            setNotice(t('jumper.missing'))
            return
          }
          setPicked(item.anchorKey)
          setAnnounced(t('jumper.jumped', { turn: item.turn }))
          close(true)
        }, [close, t])

        // A press outside both the trigger and the panel dismisses the list; a
        // press that removes the focused row must not strand focus on <body>.
        useEffect(() => {
          if (!open) return undefined
          const onPointerDown = (event) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (menuRef.current?.contains(target) === true) return
            if (rootRef.current?.contains(target) === true) return
            close(menuRef.current?.contains(document.activeElement) === true)
          }
          document.addEventListener('pointerdown', onPointerDown, true)
          return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
        }, [open, close])

        // Escape dismisses from anywhere while the list is open.
        useEffect(() => {
          if (!open) return undefined
          const onKeyDown = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return
            event.preventDefault()
            close(true)
          }
          document.addEventListener('keydown', onKeyDown)
          return () => { document.removeEventListener('keydown', onKeyDown) }
        }, [open, close])

        // Keep the panel attached to its trigger when the window resizes.
        useEffect(() => {
          if (!open) return undefined
          const onResize = () => {
            const trigger = triggerRef.current
            if (trigger !== null) setPlace(placeMenu(trigger))
          }
          window.addEventListener('resize', onResize)
          return () => { window.removeEventListener('resize', onResize) }
        }, [open])

        // A list that lost its last question cannot stay open.
        useEffect(() => {
          if (open && questions.length === 0) close(false)
        }, [open, questions.length, close])

        // A pointer opening shows the question picked last, or the newest one;
        // a keyboard opening puts focus on the requested end of the list.
        useEffect(() => {
          if (!open) return
          const target = focusTarget.current
          focusTarget.current = null
          const rows = rowsOf(menuRef.current)
          if (rows.length === 0) return
          if (target === 'first' || target === 'last') {
            const row = target === 'last' ? rows[rows.length - 1] : rows[0]
            row?.focus({ preventScroll: false })
            return
          }
          const viewport = viewportRef.current
          if (viewport === null) return
          const current = rows.find(row => row.dataset.picked !== undefined)
          if (current !== undefined) {
            showRow(viewport, current)
            return
          }
          viewport.scrollTop = viewport.scrollHeight
        }, [open])

        if (questions.length === 0) return null

        const title = t('jumper.title', { count: questions.length })

        const onTriggerKeyDown = (event) => {
          // React portals bubble through the element tree, so the panel's own
          // keys reach this handler as well: own the trigger's keys only.
          if (event.target !== triggerRef.current) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
              return
            }
            const rows = rowsOf(menuRef.current)
            const row = event.key === 'ArrowDown' ? rows[0] : rows[rows.length - 1]
            row?.focus()
            return
          }
          // Tab leaves the header, so it must not strand an open panel.
          if (event.key === 'Tab' && open) close(false)
        }

        const onMenuKeyDown = (event) => {
          const rows = rowsOf(menuRef.current)
          const index = rows.indexOf(document.activeElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (rows.length === 0) return
            const step = event.key === 'ArrowDown' ? 1 : -1
            const next = index === -1
              ? rows[step === 1 ? 0 : rows.length - 1]
              : rows[(index + step + rows.length) % rows.length]
            next?.focus({ preventScroll: false })
            return
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            const row = event.key === 'Home' ? rows[0] : rows[rows.length - 1]
            row?.focus({ preventScroll: false })
            return
          }
          // The panel is portaled after the app root, so Tab would leave the
          // page order; return to the trigger instead.
          if (event.key === 'Tab') {
            event.preventDefault()
            close(true)
          }
        }

        const styleElement = h('style', { dangerouslySetInnerHTML: { __html: JUMPER_CSS } })

        const glyph = h('span', { className: 'dsh-qj-glyph', 'aria-hidden': true },
          h('svg', { viewBox: '0 0 16 16', fill: 'none' },
            h('path', {
              d: 'M2.5 4.5h7M2.5 8h7M2.5 11.5h4',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
            }),
            h('path', {
              d: 'M11.5 6.25 13.75 8.5 11.5 10.75',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            })))

        const chevron = h('span', { className: 'dsh-qj-chevron', 'aria-hidden': true },
          h('svg', { viewBox: '0 0 16 16', fill: 'none' },
            h('path', {
              d: 'M4 6.5 8 10.5 12 6.5',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            })))

        const trigger = h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'dsh-qj-trigger',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': open ? `${menuId}-menu` : undefined,
          'aria-label': title,
          title,
          onClick: (event) => {
            if (open) {
              close(false)
              return
            }
            // A synthetic click (detail 0) comes from the keyboard: move focus
            // into the list, as a menu button does.
            openMenu(event.detail === 0 ? 'first' : 'none')
          },
        },
        glyph,
        h('span', { className: 'dsh-qj-label', 'aria-hidden': true }, t('jumper.short')),
        h('span', { className: 'dsh-qj-count', 'aria-hidden': true }, String(questions.length)),
        chevron)

        const rowElements = questions.map((item) => {
          const head = headOf(item.prompt, HEAD_CHARS)
          const current = picked === item.anchorKey
          return h('button', {
            key: item.anchorKey,
            type: 'button',
            role: 'menuitem',
            className: 'dsh-qj-row',
            'data-question-row': '',
            'data-picked': current ? '' : undefined,
            'aria-current': current ? 'true' : undefined,
            title: item.prompt,
            'aria-label': t('jumper.item', { turn: item.turn, text: head }),
            onClick: () => { pick(item) },
          },
          h('span', { className: 'dsh-qj-index', 'aria-hidden': true }, String(item.turn)),
          h('span', { className: 'dsh-qj-text' }, head))
        })

        const panel = open && place !== null
          ? createPortal(h('div', {
            ref: menuRef,
            className: 'dsh-qj-menu',
            style: {
              left: `${String(place.left)}px`,
              top: `${String(place.top)}px`,
              width: `${String(place.width)}px`,
              maxHeight: `${String(place.maxHeight)}px`,
            },
            onKeyDown: onMenuKeyDown,
          },
          h('div', { className: 'dsh-qj-header', id: `${menuId}-header` },
            t('jumper.header', { count: questions.length })),
          h('div', {
            ref: viewportRef,
            className: 'dsh-qj-viewport',
            id: `${menuId}-menu`,
            role: 'menu',
            'aria-labelledby': `${menuId}-header`,
          }, rowElements),
          notice === null
            ? null
            : h('div', { className: 'dsh-qj-notice', role: 'status' }, notice)), document.body)
          : null

        return h('div', { ref: rootRef, className: 'dsh-qj-root', onKeyDown: onTriggerKeyDown },
          styleElement,
          trigger,
          h('span', { className: 'dsh-qj-sr', role: 'status' }, announced),
          panel)
      }
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the dictionaries and both controls; every registration rides an
       * effect so unloading the plugin removes it with the module.
       * @param ctx - client root context.
       */
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'pure-chat: dictionaries')

        const ClearControl = createClearControl(ctx, t)
        ctx.effect(() => ctx.slots.inject(CLEAR_SLOT, () => ctx.slots.register({
          name: CLEAR_SLOT,
          id: 'pure-chat.clear-context',
          order: 90,
        }, ClearControl)), 'pure-chat: clear-context control')

        const QuestionJumper = createJumperView(t)
        ctx.effect(() => ctx.slots.inject(JUMPER_SLOT, () => ctx.slots.register({
          name: JUMPER_SLOT,
          id: 'question-jumper',
          order: JUMPER_ORDER,
          label: () => t('jumper.label'),
        }, QuestionJumper)), 'pure-chat: question jumper')
      },
    }
  },
})
