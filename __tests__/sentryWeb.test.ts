/**
 * lib/sentry.web.ts: the web stand-in that loads the Sentry SDK after first
 * paint. Calls made before it loads are queued and replayed; without a DSN
 * nothing loads.
 */

const mockSdk = {
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}

type Listener = (e: unknown) => void
let listeners: Record<string, Listener[]>
let idle: Array<() => void>

function stubBrowser() {
  listeners = {}
  idle = []
  const g = globalThis as Record<string, unknown>
  g.window = {
    addEventListener: (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn) },
    removeEventListener: (type: string, fn: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter(f => f !== fn)
    },
    requestIdleCallback: (fn: () => void) => { idle.push(fn) },
  }
  g.document = { readyState: 'complete' }
}

function loadModule(dsn: string | undefined): typeof import('../lib/sentry.web') {
  if (dsn) process.env.EXPO_PUBLIC_SENTRY_DSN = dsn
  else delete process.env.EXPO_PUBLIC_SENTRY_DSN
  let mod!: typeof import('../lib/sentry.web')
  jest.isolateModules(() => { mod = require('../lib/sentry.web') })
  mod.__setSdkImporter(async () => mockSdk as unknown as typeof import('@sentry/react-native'))
  return mod
}

async function flushIdleAndImport() {
  idle.splice(0).forEach(fn => fn())
  // Let the dynamic import and init settle.
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0))
}

const realWindow = (globalThis as Record<string, unknown>).window
const realDocument = (globalThis as Record<string, unknown>).document

beforeEach(() => {
  jest.clearAllMocks()
  stubBrowser()
})

afterAll(() => {
  const g = globalThis as Record<string, unknown>
  g.window = realWindow
  g.document = realDocument
  delete process.env.EXPO_PUBLIC_SENTRY_DSN
})

test('without a DSN nothing loads and calls are no-ops', async () => {
  const { initSentry, Sentry } = loadModule(undefined)
  initSentry()
  Sentry.captureException(new Error('x'))
  await flushIdleAndImport()
  expect(idle).toHaveLength(0)
  expect(mockSdk.init).not.toHaveBeenCalled()
  expect(mockSdk.captureException).not.toHaveBeenCalled()
})

test('queues calls until the SDK loads, then replays them in order', async () => {
  const { initSentry, Sentry } = loadModule('https://key@example.ingest.sentry.io/1')
  initSentry()
  const err = new Error('before load')
  Sentry.setUser({ id: 'u1' })
  Sentry.captureException(err, { extra: { a: 1 } })
  expect(mockSdk.captureException).not.toHaveBeenCalled()

  await flushIdleAndImport()

  expect(mockSdk.init).toHaveBeenCalledWith(expect.objectContaining({ tunnel: '/api/tunnel', integrations: [] }))
  expect(mockSdk.setUser).toHaveBeenCalledWith({ id: 'u1' })
  expect(mockSdk.captureException).toHaveBeenCalledWith(err, { extra: { a: 1 } })

  // After loading, calls go straight through.
  Sentry.addBreadcrumb({ message: 'later' })
  expect(mockSdk.addBreadcrumb).toHaveBeenCalledWith({ message: 'later' })
})

test('errors thrown before the SDK loads are reported once it does', async () => {
  const { initSentry } = loadModule('https://key@example.ingest.sentry.io/1')
  initSentry()
  const boom = new Error('early')
  listeners.error.forEach(fn => fn({ error: boom, message: 'early' }))
  await flushIdleAndImport()
  expect(mockSdk.captureException).toHaveBeenCalledWith(boom)
  // The SDK's own handlers take over: the temporary listener is gone.
  expect(listeners.error).toHaveLength(0)
})

test('wrap returns the component unchanged', () => {
  const { Sentry } = loadModule(undefined)
  const C = () => null
  expect(Sentry.wrap(C)).toBe(C)
})
