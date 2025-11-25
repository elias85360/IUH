describe('metrics wiring', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('updates gauges and cache hit ratio when prom-client available', () => {
    const gauges = []
    const counters = []
    const histograms = []
    jest.isolateModules(() => {
      jest.doMock('prom-client', () => {
        const Gauge = jest.fn((opts) => {
          const obj = { name: opts.name, set: jest.fn(), inc: jest.fn(), dec: jest.fn() }
          gauges.push(obj)
          return obj
        })
        const Counter = jest.fn((opts) => {
          const obj = { name: opts.name, inc: jest.fn() }
          counters.push(obj)
          return obj
        })
        const Histogram = jest.fn((opts) => {
          const obj = { name: opts.name, observe: jest.fn() }
          histograms.push(obj)
          return obj
        })
        const register = { metrics: jest.fn(async () => '#'), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })

      const metrics = require('../src/metrics')
      const app = { get: jest.fn(), use: jest.fn() }
      metrics.initMetrics(app)

      metrics.recordCacheHit('/api/test')
      metrics.recordCacheMiss('/api/test')
      metrics.recordCacheHit('/api/test')
      metrics.updateIotMetrics({ temp: 20, humid: 60, U: 230, I: 10, P: 1000, E: 1234, F: 50, pf: 0.98 })

      const ratio = gauges.find((g) => g.name === 'cache_hit_ratio')
      expect(ratio.set).toHaveBeenCalledWith({ route: '/api/test' }, expect.any(Number))

      const hitCounter = counters.find((c) => c.name === 'cache_hits_total')
      const missCounter = counters.find((c) => c.name === 'cache_misses_total')
      expect(hitCounter.inc).toHaveBeenCalled()
      expect(missCounter.inc).toHaveBeenCalled()

      const tempGauge = gauges.find((g) => g.name === 'iot_temp_celsius')
      const pfGauge = gauges.find((g) => g.name === 'iot_power_factor')
      expect(tempGauge.set).toHaveBeenCalledWith(20)
      expect(pfGauge.set).toHaveBeenCalledWith(0.98)
    })
  })

  test('initMetrics disables when prom-client missing and serves fallback', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('prom-client', () => { throw new Error('missing') })
      const express = require('express')
      const metrics = require('../src/metrics')
      const app = express()
      const ok = metrics.initMetrics(app)
      expect(ok).toBe(false)
      const res = await require('supertest')(app).get('/metrics')
      expect(res.status).toBe(200)
      expect(res.text).toContain('metrics not enabled')
    })
  })

  test('httpMetricsMiddleware records durations', () => {
    const counters = []
    const histograms = []
    jest.isolateModules(() => {
      jest.doMock('prom-client', () => {
        const Gauge = jest.fn(() => ({ set: jest.fn(), inc: jest.fn(), dec: jest.fn() }))
        const Counter = jest.fn((opts) => {
          const obj = { name: opts.name, inc: jest.fn() }
          counters.push(obj); return obj
        })
        const Histogram = jest.fn((opts) => {
          const obj = { name: opts.name, observe: jest.fn() }
          histograms.push(obj); return obj
        })
        const register = { metrics: jest.fn(async () => '#'), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const metrics = require('../src/metrics')
      const app = { get: jest.fn(), use: jest.fn() }
      metrics.initMetrics(app)
      const mw = metrics.httpMetricsMiddleware()
      const req = { method: 'GET', route: { path: '/ping' } }
      const EventEmitter = require('events')
      const res = new EventEmitter()
      res.statusCode = 200
      mw(req, res, () => {})
      res.emit('finish')
      const httpDuration = histograms.find((h) => h.name === 'http_request_duration_seconds')
      const httpTotal = counters.find((c) => c.name === 'http_requests_total')
      expect(httpDuration.observe).toHaveBeenCalled()
      expect(httpTotal.inc).toHaveBeenCalled()
    })
  })

  test('data quality, points and socket metrics update gauges and counters', () => {
    const gauges = {}
    const counters = {}
    jest.isolateModules(() => {
      jest.doMock('prom-client', () => {
        class Gauge { constructor(opts) { this.name = opts.name; this.set = jest.fn(); this.inc = jest.fn(); this.dec = jest.fn(); gauges[this.name] = this } }
        class Counter { constructor(opts) { this.name = opts.name; this.inc = jest.fn(); counters[this.name] = this } }
        class Histogram { constructor(opts) { this.name = opts.name; this.observe = jest.fn() } }
        const register = { metrics: jest.fn(async () => '#'), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const metrics = require('../src/metrics')
      const app = { get: jest.fn(), use: jest.fn() }
      metrics.initMetrics(app)
      metrics.updateDataQualityFromItems([{ deviceId: 'd1', metricKey: 'P', freshnessMs: 2000, completeness: 0.5, gaps: 2 }])
      expect(gauges.data_freshness_seconds.set).toHaveBeenCalledWith({ deviceId: 'd1', metricKey: 'P' }, expect.any(Number))
      expect(gauges.data_completeness_ratio.set).toHaveBeenCalledWith({ deviceId: 'd1', metricKey: 'P' }, 0.5)
      expect(gauges.data_gaps.set).toHaveBeenCalledWith({ deviceId: 'd1', metricKey: 'P' }, 2)

      metrics.recordPointsReturned('/api/timeseries', 3)
      expect(counters.timeseries_points_returned_total.inc).toHaveBeenCalledWith({ route: '/api/timeseries' }, 3)

      metrics.incSocketConnections()
      metrics.decSocketConnections()
      expect(gauges.socket_connections.inc).toHaveBeenCalled()
      expect(gauges.socket_connections.dec).toHaveBeenCalled()

      metrics.recordAlert({ level: 'crit', metricKey: 'P' })
      expect(counters.alerts_total.inc).toHaveBeenCalledWith({ level: 'crit', metricKey: 'P' })
    })
  })

  test('global middleware tracks requests when enabled', async () => {
    const counters = {}
    await jest.isolateModulesAsync(async () => {
      jest.doMock('prom-client', () => {
        class Gauge { constructor() { this.set = jest.fn(); this.inc = jest.fn(); this.dec = jest.fn() } }
        class Counter { constructor(opts) { this.name = opts.name; this.inc = jest.fn(); counters[this.name] = this } }
        class Histogram { constructor(opts) { this.name = opts.name; this.observe = jest.fn() } }
        const register = { metrics: jest.fn(async () => '#'), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const express = require('express')
      const metrics = require('../src/metrics')
      const app = express()
      metrics.initMetrics(app)
      app.get('/ping', (_req, res) => res.json({ ok: true }))
      app.get('/fail', (_req, res) => res.status(500).json({ error: 'x' }))
      const res = await require('supertest')(app).get('/ping')
      expect(res.status).toBe(200)
      const resFail = await require('supertest')(app).get('/fail')
      expect(resFail.status).toBe(500)
      expect(counters.http_requests_total.inc).toHaveBeenCalled()
      expect(counters.http_errors_total.inc).toHaveBeenCalled()
    })
  })

  test('initMetrics catch path disables metrics on setup error', () => {
    jest.isolateModules(() => {
      jest.doMock('prom-client', () => {
        class Gauge { constructor() { this.set = jest.fn(); this.inc = jest.fn(); this.dec = jest.fn() } }
        class Counter { constructor() { this.inc = jest.fn() } }
        class Histogram { constructor() { this.observe = jest.fn() } }
        const register = { metrics: jest.fn(async () => '#'), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn(() => { throw new Error('boom') })
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const express = require('express')
      const metrics = require('../src/metrics')
      const app = express()
      const ok = metrics.initMetrics(app)
      expect(ok).toBe(false)
    })
  })
})
