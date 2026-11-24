import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { apply } from '../index.js'
import { buildRtf, buildXls, escapeRtf, formatOfPath, FORMATS } from '../lib/documents.js'
import { clearContext, COMMAND_NAME } from '../lib/clear-context.js'
import { resolveTarget } from '../lib/write-file.js'

/**
 * Minimal stand-in for the pieces of `ctx` this plugin touches. It mirrors the
 * registry contracts that matter here: `restrict()` refuses empty filters,
 * unknown names and the reserved transport; restrictions intersect; scoped
 * registrations stay visible; applying and lifting a restriction emits
 * `tools/change`.
 */
function createHost({ globals = [], scoped = [], failRestrict = false, services = {} } = {}) {
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
    disposers: [],
    registered: new Map(),
    commands: new Map(),
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
    register(definition) {
      state.registered.set(definition.name, definition)
      return () => state.registered.delete(definition.name)
    },
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

  const commands = {
    register(definition) {
      state.commands.set(definition.name, definition)
      return () => state.commands.delete(definition.name)
    },
  }

  const ctx = {
    tools,
    logger: { error: message => state.log.push(message), warn: message => state.log.push(message) },
    get: name => (name === 'commands' ? commands : services[name]),
    effect(fn) {
      state.disposer = fn()
      state.disposers.push(state.disposer)
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

  for (const dispose of state.disposers) dispose()

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

// --- write_file -------------------------------------------------------------

test('registers the write_file tool inside the preset scope', () => {
  const { ctx, state } = createHost({ globals: [] })
  ctx.effect = fn => fn()

  apply(ctx)

  const definition = state.registered.get('write_file')
  assert.ok(definition, 'write_file is registered')
  assert.deepEqual(definition.parameters.properties.format.enum, FORMATS)
  assert.deepEqual(definition.parameters.required, ['path', 'content'])
})

test('writes a markdown file inside the working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pure-chat-test-'))
  try {
    const { ctx, state } = createHost({
      globals: [],
      services: { workingDirectory: { ensure: async () => directory } },
    })
    ctx.effect = fn => fn()
    apply(ctx)

    const definition = state.registered.get('write_file')
    const value = await definition.execute(
      { path: 'notes/报告.md', content: '# 标题\n\n正文' },
      { agent: {}, signal: undefined },
    )

    assert.equal(value.format, 'md')
    assert.equal(await readFile(join(directory, 'notes', '报告.md'), 'utf8'), '# 标题\n\n正文')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('converts the document through the Office component for pdf', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pure-chat-test-'))
  let request
  try {
    const { ctx, state } = createHost({
      globals: [],
      services: {
        workingDirectory: { ensure: async () => directory },
        officeKit: {
          async convert(input) {
            request = input
            return { pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]), missingFonts: [] }
          },
        },
      },
    })
    ctx.effect = fn => fn()
    apply(ctx)

    const definition = state.registered.get('write_file')
    const value = await definition.execute(
      { path: 'report.pdf', content: 'hello', title: 'Report' },
      { agent: {}, signal: undefined },
    )

    assert.equal(value.format, 'pdf')
    assert.equal(request.extension, 'doc', 'the PDF source is the generated RTF document')
    assert.equal(request.priority, 'foreground')
    assert.equal((await readFile(join(directory, 'report.pdf'))).length, 4)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects a target outside the working directory', () => {
  assert.throws(() => resolveTarget('C:\\work', '..\\secret.txt'), /escapes the session working directory/)
  assert.throws(() => resolveTarget('C:\\work', 'C:\\other\\x.txt'), /escapes the session working directory/)
  assert.equal(resolveTarget('C:\\work', 'a/b.txt'), 'C:\\work\\a\\b.txt')
})

test('infers the format from the extension', () => {
  assert.equal(formatOfPath('a/b.MD'), 'md')
  assert.equal(formatOfPath('a/b.pdf'), 'pdf')
  assert.equal(formatOfPath('a/b.docx'), undefined)
  assert.equal(formatOfPath('a/b'), undefined)
})

// --- documents --------------------------------------------------------------

test('escapes RTF control characters and encodes CJK as unicode escapes', () => {
  assert.equal(escapeRtf('a{b}c\\'), 'a\\{b\\}c\\\\')
  assert.equal(escapeRtf('中文'), '\\u20013?\\u25991?')
  const rtf = buildRtf('第一行\n第二行', '标题').toString('ascii')
  assert.match(rtf, /^\{\\rtf1/)
  assert.match(rtf, /\\u26631\?\\u-26472\?/, 'the title is encoded (标 题)')
  assert.equal((rtf.match(/\\par(?![a-z])/g) ?? []).length, 3, 'one paragraph per line plus the title')
})

test('builds a SpreadsheetML workbook with typed cells', () => {
  const xml = buildXls('名称\t数量\n苹果\t3', '清单').toString('utf8')
  assert.match(xml, /<Worksheet ss:Name="清单">/)
  assert.match(xml, /<Data ss:Type="Number">3<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">苹果<\/Data>/)
  assert.match(xml, /<Row ss:StyleID="header">/)
  assert.match(buildXls('a & b', undefined).toString('utf8'), /a &amp; b/)
})

// --- clear-context ----------------------------------------------------------

function sessionFixture(nodes, kinds) {
  const appended = []
  return {
    appended,
    session: {
      surface: { nodes },
      eventAt: seq => ({ type: kinds[seq] ?? 'user/message', seq }),
      append(type, data, options) {
        appended.push({ type, data, options })
        return { seq: 99 }
      },
      header: { cwd: '/work' },
    },
  }
}

function commandOf(ctx) {
  return ctx.get('commands')
}

test('clears the surface while keeping the system head', () => {
  const { ctx, state } = createHost({ globals: [], services: { agents: { turnBoundaryOf: () => ({ openTurnStartSeq: null }) } } })
  ctx.effect = fn => fn()
  apply(ctx)

  const definition = state.commands.get(COMMAND_NAME)
  assert.ok(definition, 'the clear command is registered')

  const fixture = sessionFixture([3, 7, 8, 9], { 3: 'system/message', 7: 'user/message', 8: 'assistant/message', 9: 'tool/result' })
  const result = definition.handler({ agent: { session: fixture.session }, signal: undefined })

  assert.equal(result.kind, 'success')
  assert.equal(fixture.appended.length, 1)
  const [{ type, data, options }] = fixture.appended
  assert.equal(type, 'user/message')
  assert.equal(data.role, 'user')
  assert.equal(data.source.kind, 'user')
  assert.deepEqual(options.surfaceOp, { op: 'replace', startSeq: 7, endSeq: 9 })
  assert.deepEqual(options.sourceEventSeqs, [7, 8, 9], 'every shadowed node is cited, the system head is not')
})

test('refuses to clear while a turn is open', () => {
  const { ctx } = createHost({ globals: [], services: { agents: { turnBoundaryOf: () => ({ openTurnStartSeq: 4 }) } } })

  const fixture = sessionFixture([1, 2], { 1: 'user/message', 2: 'assistant/message' })
  const result = clearContext(ctx, { session: fixture.session })

  assert.equal(result.kind, 'error')
  assert.equal(fixture.appended.length, 0)
})

test('reports an already empty context without appending', () => {
  const { ctx } = createHost({ globals: [], services: { agents: { turnBoundaryOf: () => ({ openTurnStartSeq: null }) } } })

  const fixture = sessionFixture([3], { 3: 'system/message' })
  const result = clearContext(ctx, { session: fixture.session })

  assert.equal(result.kind, 'success')
  assert.equal(fixture.appended.length, 0)
})

test('skips the command when the host provides no command registry', () => {
  const { ctx } = createHost({ globals: [] })
  ctx.get = () => undefined
  ctx.effect = fn => fn()

  assert.doesNotThrow(() => apply(ctx))
})
