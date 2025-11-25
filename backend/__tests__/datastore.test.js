const { DataStore } = require('../src/datastore')

function buildStore() {
  return new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 't', unit: 'C' }] })
}
 
afterEach(() => {
  delete process.env.PREAGG_RETENTION_DAYS
})

describe('DataStore aggregation', () => {
  test('aggregates hourly buckets with averages', () => {
    const ds = buildStore()
    const now = Date.now()
    const start = Math.floor((now - 3 * 3600_000) / 3600_000) * 3600_000
    for (let i = 0; i < 180; i++) {
      ds.addPoint('d1', 't', start + i * 60_000, i)
    }
    const pts = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: start, to: start + 3 * 3600_000, bucketMs: 3600_000 })
    expect(pts.length).toBeGreaterThanOrEqual(3)
    expect(pts[0].count).toBeGreaterThan(0)
    // Returned value should match sum/count for each bucket
    for (const p of pts) {
      expect(p.value).toBeCloseTo(p.sum / Math.max(1, p.count))
    }
    const totalCount = pts.reduce((acc, p) => acc + p.count, 0)
    expect(totalCount).toBeGreaterThanOrEqual(180)
  })

  test('drops pre-agg buckets past retention', () => {
    process.env.PREAGG_RETENTION_DAYS = '0'
    const ds = buildStore()
    const oldTs = Date.now() - 2 * 24 * 60 * 60 * 1000
    ds.addPoint('d1', 't', oldTs, 10)
    const map = ds._getPreAggMap('d1', 't', 60 * 60 * 1000)
    expect(map.size).toBe(0)
  })

  test('emits alerts with hysteresis awareness', () => {
    const ds = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 'p', thresholds: { warn: 50, crit: 100 } }] })
    const alerts = []
    ds.emitter.on('alert', (a) => alerts.push(a))
    ds.addPoint('d1', 'p', Date.now(), 10) // ok
    ds.addPoint('d1', 'p', Date.now(), 120) // crit
    ds.addPoint('d1', 'p', Date.now(), 80) // warn
    expect(alerts.map(a => a.level)).toEqual(['crit', 'warn'])
    expect(ds._lastLevel.get('d1::p')).toBe('warn')
  })

  test('aggregates fine-grain buckets under 1h', () => {
    const ds = buildStore()
    const t0 = Math.floor(Date.now() / 60_000) * 60_000
    ds.addPoint('d1', 't', t0, 10)
    ds.addPoint('d1', 't', t0 + 30_000, 20)
    const out = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: t0 - 1000, to: t0 + 60_000, bucketMs: 60_000 })
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(2)
    expect(out[0].min).toBe(10)
    expect(out[0].max).toBe(20)
    expect(out[0].value).toBeCloseTo(15)
  })

  test('below-direction hysteresis requires clearing threshold', () => {
    const ds = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 'pf', thresholds: { warn: 0.8, crit: 0.7, direction: 'below' } }] })
    const alerts = []
    ds.emitter.on('alert', (a) => alerts.push(a.level))
    ds.addPoint('d1', 'pf', Date.now(), 0.6) // crit
    ds.addPoint('d1', 'pf', Date.now(), 0.74) // warn
    ds.addPoint('d1', 'pf', Date.now(), 0.83) // should stay warn due to deadband
    ds.addPoint('d1', 'pf', Date.now(), 0.9) // ok
    expect(alerts).toEqual(['crit', 'warn', 'warn'])
    expect(ds._lastLevel.get('d1::pf')).toBe('ok')
  })

  test('respects limit on raw queries', () => {
    const ds = buildStore()
    const start = Date.now() - 1000
    for (let i = 0; i < 5; i++) {
      ds.addPoint('d1', 't', start + i, i)
    }
    const out = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: start, to: start + 10_000, limit: 2 })
    expect(out).toHaveLength(2)
    expect(out[0].value).toBe(3)
    expect(out[1].value).toBe(4)
  })

  test('respects limit on aggregated queries', () => {
    const ds = buildStore()
    const start = Math.floor((Date.now() - 3 * 3600_000) / 3600_000) * 3600_000
    for (let i = 0; i < 180; i++) {
      ds.addPoint('d1', 't', start + i * 60_000, i)
    }
    const out = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: start, to: start + 3 * 3600_000, bucketMs: 3600_000, limit: 2 })
    expect(out).toHaveLength(2)
  })

  test('mirrors to TSDB when enabled', () => {
    let mirrorCalled = 0
    jest.isolateModules(() => {
      jest.doMock('../src/db/timescale', () => {
        return {
          init: jest.fn().mockResolvedValue(),
          mirrorAddPoint: jest.fn().mockImplementation(() => { mirrorCalled += 1; return Promise.resolve() }),
          refreshCaggs: jest.fn(),
        }
      })
      process.env.TSDB_MIRROR = '1'
      const { DataStore } = require('../src/datastore')
      const ds = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 't' }] })
      ds.addPoint('d1', 't', Date.now(), 42)
      expect(mirrorCalled).toBe(1)
      delete process.env.TSDB_MIRROR
    })
  })
  test('does not mirror to TSDB when disabled', () => {
    let mirrorCalled = 0
    jest.isolateModules(() => {
      jest.doMock('../src/db/timescale', () => {
        return {
          init: jest.fn().mockResolvedValue(),
          mirrorAddPoint: jest.fn().mockImplementation(() => { mirrorCalled += 1; return Promise.resolve() }),
          refreshCaggs: jest.fn(),
        }
      })
      const { DataStore } = require('../src/datastore')
      const ds = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 't' }] })
      ds.addPoint('d1', 't', Date.now(), 42)
      expect(mirrorCalled).toBe(0)
    })
  })
  test('handles NaN values gracefully', () => {
    const ds = buildStore()
    const now = Date.now()
    ds.addPoint('d1', 't', now, NaN)
    const out = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: now - 1000, to: now + 1000 })
    expect(out).toHaveLength(1)
    expect(Number.isNaN(out[0].value)).toBe(true)
  })

  test('clamps out-of-order timestamps to maintain monotonicity', () => {
    const ds = buildStore()
    const t0 = Date.now()
    ds.addPoint('d1', 't', t0, 1)
    ds.addPoint('d1', 't', t0 - 5000, 2) // should be clamped to t0
    const out = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: t0 - 10_000, to: t0 + 1 })
    expect(out).toHaveLength(2)
    expect(out[0].ts).toBe(out[1].ts)
    expect(out[1].value).toBe(2)
  })

  test('coerces numeric-like values and computes KPIs', () => {
    const ds = buildStore()
    const now = Date.now()
    ds.addPoint('d1', 't', now - 2000, '10')
    ds.addPoint('d1', 't', now - 1000, '30')
    const kpis = ds.getKpis({ deviceId: 'd1', from: now - 5000, to: now })
    expect(kpis.t.last).toBe(30)
    expect(kpis.t.min).toBe(10)
    expect(kpis.t.max).toBe(30)
    expect(kpis.t.avg).toBeCloseTo(20, 5)
  })

})
