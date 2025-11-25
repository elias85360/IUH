describe('timescale db helpers', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.DATABASE_URL
  })

  test('getPool returns null without DATABASE_URL', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.DATABASE_URL = ''
      const ts = require('../src/db/timescale')
      await expect(ts.querySeries({})).resolves.toBeNull()
    })
  })

  test('uses singleton pool and mirrors insert', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })
    const Pool = jest.fn(() => ({ query: queryMock, on: jest.fn() }))
    await jest.isolateModulesAsync(async () => {
      jest.doMock('pg', () => ({ Pool }))
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
      const ts = require('../src/db/timescale')
      await ts.init()
      expect(Pool).toHaveBeenCalledTimes(1)
      await ts.mirrorAddPoint({ deviceId: 'd1', metricKey: 'P', ts: 1000, value: 1 })
      expect(queryMock).toHaveBeenCalled()
    })
  })

  test('querySeries chooses cagg/day and raw aggregation paths', async () => {
    const queryMock = jest.fn()
      .mockResolvedValueOnce({ rows: [{ ts: '2020-01-01T00:00:00Z', avg: 1, min: 1, max: 2, sum: 3, count: 4 }] }) // daily
      .mockResolvedValueOnce({ rows: [{ bucket: '2020-01-01T00:00:00Z', avg: 2, min: 2, max: 3, sum: 5, count: 2 }] }) // hourly
      .mockResolvedValueOnce({ rows: [{ bucket: '2020-01-01T00:00:15Z', avg: 1.5, min: 1, max: 2, sum: 3, count: 2 }] }) // dynamic bucket
      .mockResolvedValueOnce({ rows: [{ ts: 1234, value: 9 }] }) // raw points
    const Pool = jest.fn(() => ({ query: queryMock, on: jest.fn() }))
    await jest.isolateModulesAsync(async () => {
      jest.doMock('pg', () => ({ Pool }))
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
      const ts = require('../src/db/timescale')
      const rows1 = await ts.querySeries({ deviceId: 'd1', metricKey: 'P', bucketMs: 86_400_000 })
      expect(rows1[0]).toMatchObject({ ts: expect.any(Number), value: 1, min: 1, max: 2, count: 4, sum: 3 })
      const rows2 = await ts.querySeries({ deviceId: 'd1', metricKey: 'P', bucketMs: 3_600_000 })
      expect(rows2[0]).toMatchObject({ value: 2 })
      const rowsMid = await ts.querySeries({ deviceId: 'd1', metricKey: 'P', bucketMs: 15_000 })
      expect(rowsMid[0]).toMatchObject({ count: 2, sum: 3 })
      const rows3 = await ts.querySeries({ deviceId: 'd1', metricKey: 'P', bucketMs: 0 })
      expect(rows3[0]).toMatchObject({ ts: 1234, value: 9 })
    })
  })

  test('queryKpis aggregates per metric', async () => {
    const queryMock = jest.fn()
      .mockResolvedValueOnce({ rows: [{ metric_key: 'P' }] }) // distinct metrics
      .mockResolvedValueOnce({ rows: [{ last: 3, min: 1, max: 5, avg: 3 }] })
    const Pool = jest.fn(() => ({ query: queryMock, on: jest.fn() }))
    await jest.isolateModulesAsync(async () => {
      jest.doMock('pg', () => ({ Pool }))
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
      const ts = require('../src/db/timescale')
      const out = await ts.queryKpis({ deviceId: 'd1' })
      expect(out.P).toMatchObject({ last: 3, min: 1, max: 5, avg: 3 })
      expect(queryMock).toHaveBeenCalledTimes(2)
    })
  })

  test('initContinuousAggregates and refreshCaggs invoke SQL', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] })
    const Pool = jest.fn(() => ({ query: queryMock, on: jest.fn() }))
    await jest.isolateModulesAsync(async () => {
      jest.doMock('pg', () => ({ Pool }))
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
      const ts = require('../src/db/timescale')
      const ok = await ts.initContinuousAggregates()
      expect(ok).toBe(true)
      expect(queryMock).toHaveBeenCalled()
      const refreshed = await ts.refreshCaggs('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
      expect(refreshed).toBe(true)
    })
  })

  test('refreshCaggs returns false on query failure', async () => {
    const queryMock = jest.fn().mockRejectedValue(new Error('fail'))
    const Pool = jest.fn(() => ({ query: queryMock, on: jest.fn() }))
    await jest.isolateModulesAsync(async () => {
      jest.doMock('pg', () => ({ Pool }))
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db'
      const ts = require('../src/db/timescale')
      const ok = await ts.refreshCaggs('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
      expect(ok).toBe(false)
    })
  })
})
