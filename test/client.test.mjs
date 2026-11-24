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
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
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

  const sandbox = {
    window,
    document: { body: {} },
    console,
    setTimeout,
    clearTimeout,
  }
  sandbox.globalThis = sandbox

  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })

  assert.ok(registered !== undefined, 'the client module registers itself with the loader')
  assert.equal(registered.id, 'dsh-pure-chat')

  const module = registered.factory(require)
  assert.deepEqual([...module.inject], ['slots'])
  assert.equal(typeof module.apply, 'function')
  return { module, window, react, reactDom }
}

test('client module registers the composer control in the right slot', () => {
  const { module } = loadClientModule()

  const registrations = []
  let injected = null
  const ctx = {
    get: () => undefined,
    slots: {
      inject(slotName, callback) {
        injected = slotName
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }

  module.apply(ctx)

  assert.equal(injected, 'conversation.input.right', 'the control sits before the submit action')
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'pure-chat.clear-context')
  assert.equal(registrations[0].options.name, 'conversation.input.right')
  assert.equal(typeof registrations[0].component, 'function')
})

test('the control renders nothing without a session id', () => {
  const { module } = loadClientModule()

  let component
  module.apply({
    get: () => undefined,
    slots: {
      inject: (_name, callback) => callback(),
      register: (_options, registered) => {
        component = registered
        return () => {}
      },
    },
  })

  // Hooks are stubbed above, so a missing session id must short-circuit before
  // any hook-dependent work and return null.
  assert.equal(component({ sessionId: undefined }), null)
})
