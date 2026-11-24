import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply } from '../index.js'

/**
 * Minimal stand-in for the pieces of `ctx` this plugin touches. It mirrors the
 * registry contracts that matter here: `restrict()` refuses empty filters,
 * unknown names and the reserved transport; restrictions intersect; scoped
 * registrations stay visible; applying and lifting a restriction emits
 * `tools/change`.
 */
function createHost({ globals = [], scoped = [], failRestrict = false } = {}) {
  const state = {
    globals: [...globals],
    scoped: [...scoped],
    /** One entry per active restriction, like the registry's layer. */
    restrictions: [],
    restrictCalls: 0,
    listeners: new Set(),
    log: [],
    failRestrict,
    disposer: undefined,
  }

  const emit = () => {
    for (const listener of [...state.listeners]) listener()
  }

  /** Union of every active deny list: restrictions intersect. */
  const denied = () => {
    const names = []
    for (const entry of state.restrictions) {
      for (const name of entry) if (!names.includes(name)) names.push(name)
    }
    return names
  }

  const tools = {
    definitions: () => state.globals.map(name => ({ name })),
    restrict(filter) {
      if (filter.allow === undefined && filter.deny === undefined) throw new Error('empty filter')
      state.restrictCalls += 1
      if (state.failRestrict) throw new Error('registry refused')
      if (filter.deny?.includes('run_code')) throw new Error('reserved transport')
      for (const name of filter.deny ?? []) {
        if (!state.globals.includes(name)) throw new Error(`unknown global tool ${name}`)
      }
      const entry = [...filter.deny ?? []]
      state.restrictions.push(entry)
      emit()
      return () => {
        state.restrictions = state.restrictions.filter(active => active !== entry)
        emit()
      }
    },
    visible: () => [...state.globals.filter(name => !denied().includes(name)), ...state.scoped],
  }

  const ctx = {
    tools,
    logger: { error: message => state.log.push(message), warn: message => state.log.push(message) },
    effect(fn) {
      state.disposer = fn()
      return state.disposer
    },
    on(event, listener) {
      if (event !== 'tools/change') throw new Error(`unexpected event ${event}`)
      state.listeners.add(listener)
      return () => state.listeners.delete(listener)
    },
  }

  return { ctx, state, tools, emit, denied }
}

test('denies every global tool and leaves the preset web tools visible', () => {
  const { ctx, state, tools, denied } = createHost({ globals: ['read_file', 'bash'], scoped: ['web_search', 'web_fetch'] })

  apply(ctx)

  assert.deepEqual(denied(), ['read_file', 'bash'])
  assert.equal(state.restrictCalls, 1, 'a reentrant tools/change must not re-apply the restriction')
  assert.deepEqual(tools.visible(), ['web_search', 'web_fetch'])
  assert.deepEqual(state.log, [])
})

test('never names the reserved PTC transport in a deny list', () => {
  const { ctx, denied } = createHost({ globals: ['read_file', 'run_code'] })

  apply(ctx)

  assert.deepEqual(denied(), ['read_file'])
})

test('does nothing when the registry has no global tools', () => {
  const { ctx, state, denied } = createHost({ globals: [] })

  apply(ctx)

  assert.equal(state.restrictCalls, 0)
  assert.deepEqual(denied(), [])
  assert.deepEqual(state.log, [])
})

test('hides a global tool registered after the preset activated', () => {
  const { ctx, state, emit, denied } = createHost({ globals: ['read_file'], scoped: ['web_search'] })
  apply(ctx)

  state.globals.push('agent')
  emit()

  assert.deepEqual(denied(), ['read_file', 'agent'])
  assert.equal(state.restrictCalls, 2)
})

test('re-applies when a global tool is unregistered', () => {
  const { ctx, state, emit, denied } = createHost({ globals: ['read_file', 'bash'] })
  apply(ctx)

  state.globals.pop()
  emit()

  assert.deepEqual(denied(), ['read_file'])
})

test('lifts its restriction when the preset unloads', () => {
  const { ctx, state, denied } = createHost({ globals: ['read_file'] })
  apply(ctx)

  state.disposer()

  assert.deepEqual(denied(), [])
  assert.equal(state.listeners.size, 0)
})

test('refuses to activate when it cannot hide tools', () => {
  const { ctx, state } = createHost({ globals: ['read_file'], failRestrict: true })

  assert.throws(() => apply(ctx), /could not hide host-global tools/)
  assert.equal(state.log.length, 1)
})

test('reports a later failure without breaking the registry that changed', () => {
  const { ctx, state, emit, denied } = createHost({ globals: ['read_file'] })
  apply(ctx)
  state.failRestrict = true

  state.globals.push('agent')
  emit()

  assert.equal(state.log.length, 1)
  assert.match(state.log[0], /could not hide host-global tools/)
  // The previous restriction stays in place: a failed sync must not widen access.
  assert.deepEqual(denied(), ['read_file'])
})
