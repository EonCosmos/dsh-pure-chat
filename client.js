/**
 * Client half of the pure-chat bundle: a "clear context" control left of the
 * composer's submit action.
 *
 * The control is a pure view: it confirms with the person, then invokes the
 * Host command `/clear-context`, which owns the actual session-surface work.
 * It renders only in sessions whose agent has that command, so other presets
 * see no extra control.
 */
window.__ModuleLoader__.load({
  id: 'dsh-pure-chat',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const STRINGS = {
      en: {
        title: 'Clear context',
        dialogTitle: 'Clear this conversation’s context?',
        dialogBody: 'The model will start from a fresh context. The messages above stay as they are, so you can still read and copy them.',
        cancel: 'Cancel',
        confirm: 'Clear context',
        busy: 'Clearing…',
        unavailable: 'This conversation does not provide context clearing.',
        failed: 'Could not clear the context.',
      },
      zh: {
        title: '清空上下文',
        dialogTitle: '要清空当前对话的上下文吗？',
        dialogBody: '模型将从全新的上下文开始回答。上方的历史消息不会被修改或删除，仍可查看和复制。',
        cancel: '取消',
        confirm: '清空上下文',
        busy: '正在清空…',
        unavailable: '当前会话没有提供清空上下文的能力。',
        failed: '清空上下文失败。',
      },
    }

    const COMMAND = '/clear-context'
    const COMMAND_NAME = 'clear-context'

    /** Read visible text in the active language, falling back to English. */
    function translator(ctx) {
      let active = 'en'
      try {
        active = ctx.get('locale')?.getLocale()?.active ?? 'en'
      } catch {
        active = 'en'
      }
      const dict = STRINGS[active] ?? STRINGS[active.split('-')[0]] ?? STRINGS.en
      return key => dict[key] ?? STRINGS.en[key] ?? key
    }

    const ICON = h('svg', {
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

    function createControl(ctx) {
      const t = translator(ctx)

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

        const confirm = async () => {
          setBusy(true)
          setError(null)
          try {
            const commands = ctx.get('remote.commands')
            if (commands === undefined || typeof commands.execute !== 'function') {
              setError(t('unavailable'))
              return
            }
            const result = await commands.execute(sessionId, COMMAND, [])
            if (result?.ok !== true) {
              setError(result?.error?.message ?? t('failed'))
              return
            }
            const execution = result.value
            if (execution === undefined) {
              setError(t('unavailable'))
              return
            }
            if (execution.result?.kind === 'error') {
              setError(execution.result.text ?? t('failed'))
              return
            }
            setOpen(false)
          } catch (error) {
            setError(String(error?.message ?? error))
          } finally {
            setBusy(false)
          }
        }

        const button = h('button', {
          type: 'button',
          title: t('title'),
          'aria-label': t('title'),
          onClick: () => {
            setError(null)
            setOpen(true)
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          style: buttonStyle(hovered),
        }, ICON)

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
          'aria-label': t('dialogTitle'),
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
          h('div', { key: 'title', style: { fontSize: 15, fontWeight: 600, marginBottom: 8 } }, t('dialogTitle')),
          h('div', {
            key: 'body',
            style: { fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #555)' },
          }, t('dialogBody')),
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
            }, t('cancel')),
            h('button', {
              key: 'confirm',
              type: 'button',
              onClick: confirm,
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
            }, busy ? t('busy') : t('confirm')),
          ]),
        ]))

        return h(React.Fragment, null, button, ReactDOM.createPortal(dialog, document.body))
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const control = createControl(ctx)
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'pure-chat.clear-context',
          order: 90,
        }, control))
      },
    }
  },
})
