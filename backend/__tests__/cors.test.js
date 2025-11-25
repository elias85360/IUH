// CORS configuration is built in src/index.js. We mock heavy dependencies to
// capture the options function and assert allowed/refused origins.
const jestFn = () => {}

function loadIndexAndCaptureCors(originEnv) {
  let corsOptions = null
  const originalEnv = { ...process.env }
  jest.isolateModules(() => {
    jest.doMock('http', () => ({
      createServer: (_app) => ({
        once: jest.fn(),
        listen: (_p, cb) => { if (cb) cb() },
        close: (cb) => { if (cb) cb() },
      }),
    }))
    jest.doMock('express', () => {
      const appFactory = () => {
        const app = {
          use: jest.fn(),
          get: jest.fn(),
          post: jest.fn(),
          put: jest.fn(),
          options: jest.fn(),
          set: jest.fn(),
          disable: jest.fn(),
        }
        return app
      }
      appFactory.Router = () => ({ use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn() })
      appFactory.json = () => (_req, _res, next) => next()
      appFactory.urlencoded = () => (_req, _res, next) => next()
      return appFactory
    })
    jest.doMock('morgan', () => () => (_req, _res, next) => next())
    jest.doMock('compression', () => () => (_req, _res, next) => next())
    jest.doMock('cors', () => (opts) => { corsOptions = opts; return (_req, _res, next) => next() })
    jest.doMock('../src/socket', () => ({ attachSocket: () => ({ close: jest.fn() }) }))
    jest.doMock('../src/notify', () => ({ createMailerFromEnv: () => null, createRoutersFromEnv: () => null }))
    jest.doMock('../src/sources', () => ({ startIngestion: () => ({ stop: jestFn }) }))
    jest.doMock('../src/metrics', () => ({ initMetrics: () => {}, httpMetricsMiddleware: () => (_req, _res, next) => next() }))
    jest.doMock('../src/envValidation', () => ({ validateEnv: () => {} }))
    jest.doMock('../src/config', () => ({ server: { port: 0, corsOrigin: '' }, devices: [], metrics: [] }))
    process.env.CORS_ORIGIN = originEnv
    process.env.PORT = '0'
    process.env.TSDB_MIRROR = ''
    process.env.DATABASE_URL = ''
    require('../src/index')
  })
  // Restore environment
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  for (const [k, v] of Object.entries(originalEnv)) process.env[k] = v
  return corsOptions
}

async function checkOrigin(options, origin) {
  return new Promise((resolve) => {
    options.origin(origin, (err, ok) => resolve({ err, ok }))
  })
}

describe('CORS options', () => {
  test('allows configured origin and rejects others', async () => {
    const options = loadIndexAndCaptureCors('http://ok.com')
    expect(options).toBeDefined()
    const allowed = await checkOrigin(options, 'http://ok.com')
    expect(allowed.err).toBeNull()
    expect(allowed.ok).toBe(true)
    const rejected = await checkOrigin(options, 'http://bad.com')
    expect(rejected.err).toBeInstanceOf(Error)
  })

  test('allows wildcard localhost pattern and blocks unrelated origins', async () => {
    const options = loadIndexAndCaptureCors('http://localhost:*,http://other.com')
    const localAllowed = await checkOrigin(options, 'http://localhost:3000')
    expect(localAllowed.err).toBeNull()
    const listedAllowed = await checkOrigin(options, 'http://other.com')
    expect(listedAllowed.err).toBeNull()
    const denied = await checkOrigin(options, 'http://evil.com')
    expect(denied.err).toBeInstanceOf(Error)
  })
})
