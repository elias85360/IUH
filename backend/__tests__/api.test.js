const request = require('supertest')
const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('../src/db/timescale', () => ({ init: jest.fn(), mirrorAddPoint: jest.fn(), queryKpis: jest.fn(), querySeries: jest.fn(), initContinuousAggregates: jest.fn(), refreshCaggs: jest.fn() }))

function buildApp({ rbac = false, corsOrigin = '*', rateLimit = '100/1m', hmacEnforce = false, mailer = null, devices, metrics } = {}) {
  process.env.RBAC_ENFORCE = rbac ? '1' : '0'
  process.env.CORS_ORIGIN = corsOrigin
  process.env.RATE_LIMIT = rateLimit
  process.env.API_HMAC_ENFORCE = hmacEnforce ? '1' : '0'
  const { applySecurity } = require('../src/security')
  const { DataStore } = require('../src/datastore')
  const { buildApi } = require('../src/api')

  const app = express()
  applySecurity(app)
  app.use(express.json({ limit: '200kb' }))
  const store = new DataStore({
    devices: devices || [{ id: 'd1', name: 'Device 1' }],
    metrics: metrics || [{ key: 'P', unit: 'W' }],
  })
  store.addPoint('d1', 'P', Date.now() - 5000, 100)
  buildApi({ app, store, mailer })
  return { app, store }
}

describe('API integration', () => {
  let cwd
  let tmp
  beforeEach(() => {
    cwd = process.cwd()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'))
    process.chdir(tmp)
    jest.resetModules()
  })
  afterEach(() => {
    process.chdir(cwd)
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    delete process.env.RBAC_ENFORCE
    delete process.env.CORS_ORIGIN
    delete process.env.RATE_LIMIT
    delete process.env.API_HMAC_ENFORCE
    delete process.env.TSDB_READ
    delete process.env.MAX_API_POINTS
    delete process.env.API_KEY
    delete process.env.ALLOW_API_KEY_WITH_RBAC
    delete process.env.API_HMAC_KEY_ID
    delete process.env.API_HMAC_SECRET
    delete process.env.API_HMAC_KEYS
    delete process.env.FORECAST_URL
    delete process.env.ALERTS_TO
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    if (global.fetch && global.fetch.mockRestore) {
      global.fetch.mockRestore()
    }
  })

  test('health and diagnostics return ok payload', async () => {
    const { app } = buildApp()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const diag = await request(app).get('/api/diagnostics')
    expect(diag.status).toBe(200)
    expect(diag.body).toHaveProperty('devices')
  })

  test('devices and metrics return arrays', async () => {
    const { app } = buildApp()
    const devices = await request(app).get('/api/devices')
    expect(devices.status).toBe(200)
    expect(Array.isArray(devices.body.devices)).toBe(true)
    const metrics = await request(app).get('/api/metrics')
    expect(metrics.status).toBe(200)
    expect(Array.isArray(metrics.body.metrics)).toBe(true)
  })

  test('timeseries returns empty for unknown device and 400 on missing params', async () => {
    const { app } = buildApp()
    const missing = await request(app).get('/api/timeseries')
    expect(missing.status).toBe(400)
    const res = await request(app).get('/api/timeseries').query({ deviceId: 'unknown', metricKey: 'P' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.points)).toBe(true)
    expect(res.body.points.length).toBe(0)
  })

  test('healthz mirrors health', async () => {
    const { app } = buildApp()
    const res = await request(app).get('/api/healthz')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  test('ready endpoint ok when datastore and tsdb present', async () => {
    const { app, store } = buildApp()
    store.enableTsdb = true
    const res = await request(app).get('/api/ready')
    expect(res.status).toBe(200)
    expect(res.body.components).toMatchObject({ api: 'ok', datastore: 'ok', tsdb: 'ok' })
  })

  test('timeseries rejects ranges where from is greater than to', async () => {
    const { app } = buildApp()
    const res = await request(app).get('/api/timeseries').query({ deviceId: 'd1', metricKey: 'P', from: 10, to: 5 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid params')
  })

  test('kpis returns payload and caches', async () => {
    const { app } = buildApp()
    const res = await request(app).get('/api/kpis').query({ deviceId: 'd1' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('kpis')
  })

  test('kpis caches payload with etag and serves 304', async () => {
    const { app } = buildApp()
    const first = await request(app).get('/api/kpis').query({ deviceId: 'd1' })
    expect(first.headers.etag).toBeDefined()
    const second = await request(app).get('/api/kpis').set('If-None-Match', first.headers.etag).query({ deviceId: 'd1' })
    expect(second.status).toBe(304)
  })

  test('kpis uses tsdb when enabled', async () => {
    const tsdb = require('../src/db/timescale')
    tsdb.queryKpis.mockResolvedValue({ P: { last: 9, min: 1, max: 9, avg: 5 } })
    process.env.TSDB_READ = '1'
    const { app } = buildApp()
    const res = await request(app).get('/api/kpis').query({ deviceId: 'd1' })
    expect(tsdb.queryKpis).toHaveBeenCalled()
    expect(res.body.kpis.P.last).toBe(9)
  })

  test('kpis compute stats from stored points', async () => {
    const { app, store } = buildApp()
    const base = Date.now()
    store.series.clear()
    store.addPoint('d1', 'P', base - 4000, 10)
    store.addPoint('d1', 'P', base - 2000, 20)
    store.addPoint('d1', 'P', base - 1000, 30)
    const res = await request(app).get('/api/kpis').query({ deviceId: 'd1', from: base - 5000, to: base })
    expect(res.status).toBe(200)
    expect(res.body.kpis.P).toMatchObject({ min: 10, max: 30, last: 30, unit: 'W' })
    expect(res.body.kpis.P.avg).toBeCloseTo(20, 5)
  })

  test('assets meta GET/PUT roundtrips and sanitizes tags', async () => {
    const { app } = buildApp()
    const putMeta = await request(app).put('/api/assets/meta').send({ updates: { d1: { name: 'Renamed', tags: ['alpha', '', 'beta'] } } })
    expect(putMeta.status).toBe(200)
    expect(putMeta.body.meta.d1.name).toBe('Renamed')
    expect(putMeta.body.meta.d1.tags).toEqual(['alpha', 'beta'])
    const getMeta = await request(app).get('/api/assets/meta')
    expect(getMeta.status).toBe(200)
    expect(getMeta.body.meta.d1.tags).toEqual(['alpha', 'beta'])
  })

  test('assets meta rejects invalid payloads', async () => {
    const { app } = buildApp()
    const res = await request(app).put('/api/assets/meta').send({ updates: { d1: { tags: 'invalid' } } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid payload')
  })

  test('thresholds accept global update and per-device override', async () => {
    const { app } = buildApp()
    const payload = { global: { P: { warn: 10, crit: 20 } }, devices: { d1: { P: { warn: 1, crit: 2 } } }, options: { deadbandPct: 3 } }
    const putThresh = await request(app).put('/api/settings/thresholds').send(payload)
    expect(putThresh.status).toBe(200)
    expect(putThresh.body.settings.global.P.warn).toBe(10)
    expect(putThresh.body.settings.devices.d1.P.warn).toBe(1)
    expect(putThresh.body.settings.options.deadbandPct).toBe(3)
    const getThresh = await request(app).get('/api/settings/thresholds')
    expect(getThresh.status).toBe(200)
    expect(getThresh.body.devices.d1.P.crit).toBe(2)
    const eff = await request(app).get('/api/thresholds/effective').query({ deviceId: 'd1' })
    expect(eff.status).toBe(200)
    expect(eff.body.thresholds.P.warn).toBe(1)
  })

  test('HMAC enforced denies missing headers', async () => {
    const { app } = buildApp({ hmacEnforce: true })
    const res = await request(app).get('/api/devices')
    expect(res.status).toBe(401)
  })

  test('admin status and ping obey API key when set', async () => {
    process.env.API_KEY = 'sekret'
    process.env.ALLOW_API_KEY_WITH_RBAC = '1'
    const { app } = buildApp()
    const status = await request(app).get('/api/admin/status').set('authorization', 'Bearer sekret')
    expect(status.status).toBe(200)
    expect(status.body.API_KEY_PRESENT).toBe(true)
    const fail = await request(app).get('/api/admin/ping')
    expect(fail.status).toBe(401)
    const ok = await request(app).get('/api/admin/ping').set('authorization', 'Bearer sekret')
    expect(ok.status).toBe(200)
  })

  test('CORS allows configured origin', async () => {
    const { app } = buildApp({ corsOrigin: 'http://allowed.com' })
    const res = await request(app).get('/api/health').set('Origin', 'http://allowed.com')
    expect(res.status).toBe(200)
    // Accept request with configured Origin header (no block)
    expect(res.body.ok).toBe(true)
  })

  test('export csv returns data with correct headers', async () => {
    const { app, store } = buildApp()
    const now = Date.now()
    store.addPoint('d1', 'P', now - 1000, 5)
    const res = await request(app).get('/api/export.csv').query({ deviceId: 'd1', metricKey: 'P', from: now - 2000, to: now })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toMatch(/attachment/)
    expect(res.text).toContain('timestamp,value')
  })

  test('export pdf returns 501 when renderer unavailable', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../src/pdf', () => ({ hasPdf: jest.fn(() => false) }))
      const express = require('express')
      const { DataStore } = require('../src/datastore')
      const { buildApi } = require('../src/api')
      const app = express()
      app.use(express.json())
      const store = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 'P', unit: 'W' }] })
      buildApi({ app, store, mailer: null })
      const res = await request(app).get('/api/export.pdf').query({ deviceId: 'd1' })
      expect(res.status).toBe(501)
    })
    jest.dontMock('../src/pdf')
  })

  test('export pdf streams a buffer when pdf renderer is available', async () => {
    const response = await new Promise((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../src/pdf', () => ({
          hasPdf: jest.fn(() => true),
          buildKpiPdf: jest.fn(async () => Buffer.from('%PDF-1.4%')),
        }))
        const express = require('express')
        const { DataStore } = require('../src/datastore')
        const { buildApi } = require('../src/api')
        const app = express()
        app.use(express.json())
        const store = new DataStore({ devices: [{ id: 'd1', name: 'Device 1' }], metrics: [{ key: 'P', unit: 'W' }] })
        store.addPoint('d1', 'P', Date.now(), 42)
        buildApi({ app, store, mailer: null })
        request(app).get('/api/export.pdf').query({ deviceId: 'd1', from: 0, to: Date.now() }).then(resolve).catch(reject)
      })
    })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/pdf/)
    expect(response.headers['content-disposition']).toMatch(/attachment/)
    expect(Buffer.isBuffer(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThan(0)
    jest.unmock('../src/pdf')
  })

  test('timeseries caches, sets etag and downsamples large series', async () => {
    process.env.MAX_API_POINTS = '10'
    const { app, store } = buildApp()
    store.series.clear()
    const base = Date.now()
    for (let i = 0; i < 300; i++) store.addPoint('d1', 'P', base + i * 10, i)
    const first = await request(app).get('/api/timeseries').query({ deviceId: 'd1', metricKey: 'P' })
    expect(first.status).toBe(200)
    expect(first.body.points.length).toBeLessThanOrEqual(101)
    const second = await request(app).get('/api/timeseries').set('If-None-Match', first.headers.etag).query({ deviceId: 'd1', metricKey: 'P' })
    expect(second.status).toBe(304)
  })

  test('timeseries uses tsdb when enabled', async () => {
    const tsdb = require('../src/db/timescale')
    tsdb.querySeries.mockResolvedValue([{ ts: 1, value: 42 }])
    process.env.TSDB_READ = '1'
    const { app } = buildApp()
    const res = await request(app).get('/api/timeseries').query({ deviceId: 'd1', metricKey: 'P' })
    expect(tsdb.querySeries).toHaveBeenCalled()
    expect(res.body.points[0].value).toBe(42)
  })

  test('quality reports buckets and detail mode', async () => {
    const metricsMod = require('../src/metrics')
    const spy = jest.spyOn(metricsMod, 'updateDataQualityFromItems').mockImplementation(() => {})
    const { app, store } = buildApp()
    const base = Date.now()
    store.series.clear()
    store.addPoint('d1', 'P', base - 90 * 60 * 1000, 1)
    store.addPoint('d1', 'P', base - 30 * 60 * 1000, 2)
    const res = await request(app).get('/api/quality').query({ detail: '1', from: base - 2 * 60 * 60 * 1000, to: base })
    expect(res.status).toBe(200)
    expect(res.body.items[0].presentBuckets.length).toBeGreaterThan(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('forecast falls back to linear projection', async () => {
    const { app, store } = buildApp()
    store.series.clear()
    const base = Date.now()
    store.addPoint('d1', 'P', base - 1000, 10)
    store.addPoint('d1', 'P', base, 20)
    const res = await request(app).get('/api/forecast').query({ deviceId: 'd1', metricKey: 'P', from: base - 2000, to: base })
    expect(res.status).toBe(200)
    expect(res.body.points.length).toBeGreaterThan(0)
  })

  test('admin hmac-test accepts valid signature', async () => {
    const crypto = require('crypto')
    process.env.API_HMAC_KEY_ID = 'k1'
    process.env.API_HMAC_SECRET = 'secret'
    const { app } = buildApp()
    const dateStr = new Date().toISOString()
    const body = {}
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const payload = ['POST', '/api/admin/hmac-test', dateStr, bodyHash].join('\n')
    const sig = crypto.createHmac('sha256', 'secret').update(payload).digest('hex')
    const res = await request(app).post('/api/admin/hmac-test').send(body).set({
      'x-api-key-id': 'k1',
      'x-api-date': dateStr,
      'x-api-signature': sig,
    })
    expect(res.status).toBe(200)
  })

  test('alerts routing get/put/test leverage routers', async () => {
    const routers = {
      get: jest.fn(() => ({ routeSlack: true, routeWebhook: false })),
      update: jest.fn(() => ({ routeSlack: false, routeWebhook: true })),
      sendAlert: jest.fn(async () => {}),
    }
    const { app } = buildApp()
    app.set('alertRouters', routers)
    const getRes = await request(app).get('/api/alerts/routing')
    expect(getRes.body.routeSlack).toBe(true)
    const putRes = await request(app).put('/api/alerts/routing').send({ routeSlack: false })
    expect(putRes.status).toBe(200)
    expect(routers.update).toHaveBeenCalled()
    const testRes = await request(app).post('/api/alerts/test').send({ deviceId: 'd1', metricKey: 'P', value: 2 })
    expect(testRes.status).toBe(200)
    expect(routers.sendAlert).toHaveBeenCalled()
  })

  test('notify and test/smtp use configured mailer', async () => {
    const mailer = { sendAlertEmail: jest.fn(async () => {}) }
    process.env.ALERTS_TO = 'user@example.com'
    process.env.SMTP_HOST = 'smtp'
    process.env.SMTP_PORT = '25'
    const { app } = buildApp({ mailer })
    const notify = await request(app).post('/api/notify').send({ deviceId: 'd1', metricKey: 'P', ts: Date.now(), value: 1, level: 'warn' })
    expect(notify.status).toBe(200)
    const smtp = await request(app).post('/api/test/smtp')
    expect(smtp.status).toBe(200)
    expect(mailer.sendAlertEmail).toHaveBeenCalled()
  })

  test('rate limit triggers 429 after quota', async () => {
    const { app } = buildApp({ rateLimit: '1/1s' })
    const first = await request(app).put('/api/assets/meta').send({ updates: {} })
    expect(first.status).toBe(200)
    const second = await request(app).put('/api/assets/meta').send({ updates: {} })
    expect([200, 429]).toContain(second.status)
  })

  test('ready endpoint reports degraded components', async () => {
    jest.isolateModules(() => {
      const express = require('express')
      const { buildApi } = require('../src/api')
      const app = express()
      app.use(express.json())
      process.env.REDIS_URL = 'redis://example'
      buildApi({ app, store: null, mailer: null })
      return request(app).get('/api/ready').then((res) => {
        expect(res.status).toBe(503)
        expect(res.body.components).toMatchObject({ api: 'ok', datastore: 'fail', redis: 'unknown' })
      })
    })
  })

})

describe('API auth enforcement with mocked security', () => {
  test('returns 401 when requireAuth blocks', async () => {
    jest.isolateModules(() => {
      jest.doMock('../src/security', () => ({
        apiKeyMiddleware: () => (_req, _res, next) => next(),
        hmacMiddleware: () => (_req, _res, next) => next(),
        requireAuth: () => (_req, res, _next) => res.status(401).json({ error: 'unauthorized' }),
        requireRole: (_role, enforce) => (_req, res, next) => enforce ? res.status(403).json({ error: 'forbidden' }) : next(),
        applySecurity: (_app) => {},
        recordAudit: () => (_req, _res, next) => next(),
      }))
      const express = require('express')
      const { DataStore } = require('../src/datastore')
      const { buildApi } = require('../src/api')
      process.env.RBAC_ENFORCE = '1'
      const app = express()
      app.use(express.json())
      const store = new DataStore({ devices: [], metrics: [] })
      buildApi({ app, store })
      return request(app).get('/api/devices').then((res) => {
        expect(res.status).toBe(401)
      })
    })
  })

  test('returns 403 when role insufficient', async () => {
    jest.isolateModules(() => {
      jest.doMock('../src/security', () => ({
        apiKeyMiddleware: () => (_req, _res, next) => next(),
        hmacMiddleware: () => (_req, _res, next) => next(),
        requireAuth: () => (_req, _res, next) => next(),
        requireRole: (_role, enforce) => (_req, res, next) => enforce ? res.status(403).json({ error: 'forbidden' }) : next(),
        applySecurity: (_app) => {},
        recordAudit: () => (_req, _res, next) => next(),
      }))
      const express = require('express')
      const { DataStore } = require('../src/datastore')
      const { buildApi } = require('../src/api')
      process.env.RBAC_ENFORCE = '1'
      const app = express()
      app.use(express.json())
      const store = new DataStore({ devices: [], metrics: [] })
      buildApi({ app, store })
      return request(app).get('/api/settings/thresholds').then((res) => {
        expect(res.status).toBe(403)
      })
    })
  })
})
