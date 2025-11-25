import { describe, it, expect, vi, beforeEach } from 'vitest'

function loadWithEnv(env) {
  vi.resetModules()
  if (!global.fetch) global.fetch = vi.fn()
  global.import = global.import || ((mod) => import(mod))
  if (!global.sessionStorage) {
    global.sessionStorage = {
      _s: new Map(),
      getItem: (k) => (sessionStorage._s.has(k) ? sessionStorage._s.get(k) : null),
      setItem: (k, v) => sessionStorage._s.set(k, v),
      removeItem: (k) => sessionStorage._s.delete(k),
    }
  }
  global.import.meta = { env }
  process.env = { ...process.env, ...env }
  return import('./masterClient.js')
}

describe('masterClient helpers', () => {
  const env = {
    VITE_DATA_SOURCE: 'master',
    VITE_MASTER_BASE: 'http://master',
    VITE_KIENLAB_DEVICES: 'dev1',
  }

  beforeEach(() => {
    vi.resetModules()
    global.fetch = undefined
    global.sessionStorage = undefined
  })

  it('maps raw rows with synonyms', async () => {
    const { mapRow } = await loadWithEnv(env)
    const row = { timestamp: '2024-01-01T00:00:00Z', Voltage: 230, Power: 1200 }
    const mapped = mapRow(row)
    expect(mapped.values.U).toBe(230)
    expect(mapped.values.P).toBe(1200)
  })

  it('bucketizes rows averaging values', async () => {
    const { bucketize } = await loadWithEnv(env)
    const rows = [
      { ts: 0, values: { P: 10 } },
      { ts: 1000, values: { P: 30 } },
    ]
    const out = bucketize(rows, 'P', 0, 2000, 1000)
    expect(out).toHaveLength(2)
    expect(out[0].value).toBe(10)
    expect(out[1].value).toBe(30)
  })

  it('apiRaw fetches and caches master data in master mode', async () => {
    const payload = [{ ts: 1, values: { P: 1 } }]
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) })
    const { apiRaw } = await loadWithEnv(env)
    const res = await apiRaw({ devId: 'dev1', length: 10 })
    expect(res).toEqual(payload)
  })

  it('returns cached session rows when available', async () => {
    let mod = await loadWithEnv(env)
    const rows = [{ ts: 1, values: { P: 2 } }]
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) })
    await mod.apiRaw({ devId: 'dev1', length: 10 }) // prime cache + sessionStorage
    global.fetch = vi.fn()
    mod = await loadWithEnv(env) // reload module to use sessionStorage cache
    const res = await mod.apiRaw({ devId: 'dev1', length: 10 })
    expect(res).toEqual(rows)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
