#!/usr/bin/env node
// Minimal backend unit tests without external frameworks.
// Runs a few assertions over security middleware and datastore.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load backend modules (CommonJS) via dynamic import of transpiled require
const security = await import(pathToFileURL(path.resolve(__dirname, '../../backend/src/security.js')))
const { DataStore } = await import(pathToFileURL(path.resolve(__dirname, '../../backend/src/datastore.js')))

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {}, ended: false }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (o) => { res.body = o; res.ended = true; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = () => { res.ended = true }
  return res
}

async function run() {
  let passed = 0
  let failed = 0
  const runCase = async (name, fn) => {
    try { await fn(); console.log('✓', name); passed++ } catch (e) { console.error('✗', name, '-', e.message); failed++ }
  }

  // ===== apiKeyMiddleware =====
  await runCase('apiKeyMiddleware denies missing auth when required', async () => {
    const mw = security.apiKeyMiddleware(true)
    const req = { method: 'GET', headers: {} }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 401)
  })

  await runCase('apiKeyMiddleware allows matching Bearer token', async () => {
    process.env.API_KEY = 'abc123'
    const mw = security.apiKeyMiddleware(true)
    const req = { method: 'GET', headers: { authorization: 'Bearer abc123' } }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, 200)
  })

  await runCase('apiKeyMiddleware defers on JWT-looking token', async () => {
    const jwtLike = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from('{}').toString('base64url') + '.sig'
    const mw = security.apiKeyMiddleware(true)
    const req = { method: 'GET', headers: { authorization: `Bearer ${jwtLike}` } }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
  })

  // ===== hmacMiddleware =====
  await runCase('hmacMiddleware requires headers when enforce=1', async () => {
    const mw = security.hmacMiddleware(true)
    const req = { method: 'GET', originalUrl: '/api/devices', headers: {} }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 401)
  })

  await runCase('hmacMiddleware validates correct signature', async () => {
    const keyId = 'key1'
    const secret = 's3cr3t'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    const mw = security.hmacMiddleware(true)
    const method = 'GET'
    const pathWithQuery = '/api/devices?x=1'
    const dateStr = new Date().toUTCString()
    const bodyText = ''
    const payload = [method, pathWithQuery, dateStr, bodyText].join('\n')
    const h = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const req = { method, originalUrl: pathWithQuery, headers: { 'x-api-key-id': keyId, 'x-api-date': dateStr, 'x-api-signature': h } }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
  })

  // ===== DataStore pre-aggregations =====
  await runCase('DataStore aggregates hourly buckets', async () => {
    const ds = new DataStore({ devices: [{ id: 'd1', name: 'D1' }], metrics: [{ key: 't', unit: 'C' }] })
    const start = Date.now() - 3 * 3600_000
    // Add 180 points: every minute for 3 hours, value = minute index
    for (let i = 0; i < 180; i++) {
      ds.addPoint('d1', 't', start + i * 60_000, i)
    }
    const pts = ds.querySeries({ deviceId: 'd1', metricKey: 't', from: start, to: start + 3 * 3600_000, bucketMs: 3600_000 })
    assert.ok(pts.length >= 3)
    // Average of first hour (0..59) ~= 29.5
    assert.ok(Math.abs(pts[0].value - 29.5) < 0.5)
    assert.ok(pts[0].count >= 60)
  })

  if (failed) {
    console.error(`\n${failed} test(s) failed, ${passed} passed`)
    process.exit(1)
  } else {
    console.log(`\nAll tests passed: ${passed}`)
  }
}

run()

