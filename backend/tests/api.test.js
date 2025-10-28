const request = require('supertest')
const express = require('express')

// Build a lightweight app instance for tests without binding a port
function buildTestApp() {
  const app = express()
  app.use(express.json())
  // Initialize metrics endpoint unconditionally
  try { require('../src/metrics').initMetrics(app) } catch {}
  // Apply minimal security (rate limiter is mounted under /api in src/security)
  try { require('../src/security').applySecurity(app) } catch {}
  // Create a DataStore and mount API routes
  const { DataStore } = require('../src/datastore')
  const config = require('../src/config')
  const store = new DataStore({ devices: config.devices, metrics: config.metrics })
  const { buildApi } = require('../src/api')
  buildApi({ app, store, mailer: null })
  return app
}

describe('Backend API smoke', () => {
  const app = buildTestApp()

  test('GET /metrics responds 200', async () => {
    const res = await request(app).get('/metrics').expect(200)
    expect(res.text).toMatch(/app_info|http_requests_total|text\/plain/)
  })

  test('GET /api/devices returns list', async () => {
    const res = await request(app).get('/api/devices').expect(200)
    expect(Array.isArray(res.body.devices)).toBe(true)
  })

  test('GET /api/metrics returns list', async () => {
    const res = await request(app).get('/api/metrics').expect(200)
    expect(Array.isArray(res.body.metrics)).toBe(true)
  })

  test('GET /api/kpis returns object (may be empty)', async () => {
    // pick first device id from config
    const config = require('../src/config')
    const devId = config.devices[0].id
    const res = await request(app).get(`/api/kpis?deviceId=${encodeURIComponent(devId)}`).expect(200)
    expect(res.body).toHaveProperty('deviceId', devId)
    expect(res.body).toHaveProperty('kpis')
  })

  test('GET /api/timeseries returns points (may be empty)', async () => {
    const config = require('../src/config')
    const devId = config.devices[0].id
    const metricKey = config.metrics[0].key
    const res = await request(app).get(`/api/timeseries?deviceId=${encodeURIComponent(devId)}&metricKey=${encodeURIComponent(metricKey)}`).expect(200)
    expect(res.body).toHaveProperty('deviceId', devId)
    expect(res.body).toHaveProperty('metricKey', metricKey)
    expect(Array.isArray(res.body.points)).toBe(true)
  })

  test('GET /api/timeseries rejects too-small bucketMs', async () => {
    const config = require('../src/config')
    const devId = config.devices[0].id
    const metricKey = config.metrics[0].key
    const res = await request(app).get(`/api/timeseries?deviceId=${encodeURIComponent(devId)}&metricKey=${encodeURIComponent(metricKey)}&bucketMs=10`)
    expect(res.status).toBe(400)
  })

  test('GET /api/timeseries enforces limit <= 10000', async () => {
    const config = require('../src/config')
    const devId = config.devices[0].id
    const metricKey = config.metrics[0].key
    const res = await request(app).get(`/api/timeseries?deviceId=${encodeURIComponent(devId)}&metricKey=${encodeURIComponent(metricKey)}&limit=1000000`)
    expect(res.status).toBe(400)
  })
})
