const request = require('supertest')

describe('metrics endpoint', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.METRICS_API_KEY
  })

  test('serves Prometheus metrics without crashing', async () => {
    const metricText = '# HELP http_request_duration_seconds\n# TYPE http_request_duration_seconds histogram\n'
    await jest.isolateModulesAsync(async () => {
      jest.doMock('prom-client', () => {
        const Gauge = jest.fn(() => ({ set: jest.fn(), inc: jest.fn(), dec: jest.fn() }))
        const Counter = jest.fn(() => ({ inc: jest.fn() }))
        const Histogram = jest.fn(() => ({ observe: jest.fn() }))
        const register = { metrics: jest.fn(async () => metricText), contentType: 'text/plain; version=0.0.4' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const express = require('express')
      const { initMetrics } = require('../src/metrics')
      const app = express()
      initMetrics(app)
      const res = await request(app).get('/metrics')
      expect(res.status).toBe(200)
      expect(res.text).toContain('http_request_duration_seconds')
      expect(res.headers['content-type']).toContain('text/plain')
    })
  })

  test('protects /metrics with METRICS_API_KEY', async () => {
    const metricText = '# HELP cache_hits_total\n'
    await jest.isolateModulesAsync(async () => {
      process.env.METRICS_API_KEY = 'secret'
      jest.doMock('prom-client', () => {
        const Gauge = jest.fn(() => ({ set: jest.fn(), inc: jest.fn(), dec: jest.fn() }))
        const Counter = jest.fn(() => ({ inc: jest.fn() }))
        const Histogram = jest.fn(() => ({ observe: jest.fn() }))
        const register = { metrics: jest.fn(async () => metricText), contentType: 'text/plain' }
        const collectDefaultMetrics = jest.fn()
        return { Gauge, Counter, Histogram, register, collectDefaultMetrics }
      })
      const express = require('express')
      const { initMetrics } = require('../src/metrics')
      const app = express()
      initMetrics(app)
      const forbidden = await request(app).get('/metrics')
      expect(forbidden.status).toBe(403)
      const ok = await request(app).get('/metrics').set('authorization', 'Bearer secret')
      expect(ok.status).toBe(200)
      expect(ok.text).toContain('cache_hits_total')
    })
  })
})
