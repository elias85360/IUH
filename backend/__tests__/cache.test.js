describe('cache helpers', () => {
  afterEach(() => {
    delete process.env.REDIS_URL
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('falls back to in-memory cache without Redis', async () => {
    const { cacheSet, cacheGet, makeKey } = require('../src/cache')
    const key = makeKey('t', { a: 1 })
    await cacheSet(key, { v: 42 }, 0.001) // very short TTL
    expect(await cacheGet(key)).toEqual({ v: 42 })
    await new Promise((r) => setTimeout(r, 5))
    expect(await cacheGet(key)).toBeNull()
  })

  test('uses Redis backend when available', async () => {
    jest.isolateModules(() => {
      jest.doMock('ioredis', () => {
        return class FakeRedis {
          constructor() { this.store = new Map() }
          on() {}
          async get(k) { return this.store.get(k) || null }
          async set(k, v) { this.store.set(k, v); return 'OK' }
        }
      })
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { cacheSet, cacheGet, makeKey } = require('../src/cache')
      const key = makeKey('r', { id: 1 })
      return cacheSet(key, { foo: 'bar' }, 1).then(async () => {
        const val = await cacheGet(key)
        expect(val).toEqual({ foo: 'bar' })
      })
    })
  })

  test('continues with memory cache when Redis init fails', async () => {
    jest.isolateModules(() => {
      jest.doMock('ioredis', () => { throw new Error('init fail') })
      process.env.REDIS_URL = 'redis://bad'
      const { cacheSet, cacheGet, makeKey } = require('../src/cache')
      const key = makeKey('m', { id: 2 })
      return cacheSet(key, { x: 1 }, 1).then(async () => {
        const val = await cacheGet(key)
        expect(val).toEqual({ x: 1 })
      })
    })
  })
})
