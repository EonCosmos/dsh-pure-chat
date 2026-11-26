import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/**
 * Load the browser half the way the Web page does: install a module loader
 * stub, execute the file in a sandbox, then call the exported factory with a
 * `require` shim and apply it to a fake slots context.
 */
function loadClientModule() {
  let registered

  const react = {
    createElement: (type, props, children) => ({ type, props, children }),
    Fragment: Symbol('Fragment'),
    useState: value => [value, () => {}],
    useEffect: () => {},
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useRef: value => ({ current: value }),
    useId: () => 'id',
  }
  const reactDom = { createPortal: (node, target) => ({ node, target }) }

  const require = name => {
    if (name === 'react') return react
    if (name === 'react-dom') return reactDom
    throw new Error(`unexpected module "${name}"`)
  }

  const window = {
    __ModuleLoader__: {
      load(config) {
        registered = config
      },
      addEventListener() {},
      removeEventListener() {},
    },
  }

  const sandbox = { window, document: { body: {} }, console, setTimeout, clearTimeout }
  sandbox.globalThis = sandbox

  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })

  assert.ok(registered !== undefined, 'the client module registers itself with the loader')
  assert.equal(registered.id, 'dsh-pure-chat')

  const module = registered.factory(require)
  assert.deepEqual([...module.inject], ['slots', 'locale'])
  assert.equal(typeof module.apply, 'function')
  return { module, window, react, reactDom }
}

/** Build the fake client context with both slots and the locale registry. */
function createClientContext() {
  const registrations = []
  const dictionaries = []
  const injected = []
  const ctx = {
    get: () => undefined,
    effect: fn => fn(),
    locale: {
      bind: () => key => key,
      register: (ns, dicts) => {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
    },
    slots: {
      inject(slotName, callback) {
        injected.push(slotName)
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return { ctx, registrations, dictionaries, injected }
}

test('the client module registers both controls in their slots', () => {
  const { module } = loadClientModule()
  const { ctx, registrations, dictionaries, injected } = createClientContext()

  module.apply(ctx)

  assert.deepEqual(injected, ['conversation.input.right', 'conversation.session.header.actions'])
  assert.equal(registrations.length, 2)

  const clear = registrations.find(entry => entry.options.name === 'conversation.input.right')
  assert.equal(clear?.options.id, 'pure-chat.clear-context')

  const jumper = registrations.find(entry => entry.options.name === 'conversation.session.header.actions')
  assert.equal(jumper?.options.id, 'question-jumper')
  assert.equal(jumper?.options.order, -20, 'the jumper leads the header action row')
  assert.equal(typeof jumper?.options.label, 'function', 'the header label is localized through a thunk')

  assert.equal(dictionaries.length, 1, 'one dictionary registration covers both controls')
  assert.ok(dictionaries[0].dicts.zh['clear.title'], 'Chinese copy for the clear control')
  assert.ok(dictionaries[0].dicts.en['jumper.title'], 'English copy for the jumper')
})

test('the clear control renders nothing without a session id', () => {
  const { module } = loadClientModule()
  const { ctx, registrations } = createClientContext()

  module.apply(ctx)

  const clear = registrations.find(entry => entry.options.name === 'conversation.input.right')
  // Hooks are stubbed above, so a missing session id must short-circuit before
  // any hook-dependent work and return null.
  assert.equal(clear.component({ sessionId: undefined }), null)
})
