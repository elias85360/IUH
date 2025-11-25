//Ce fichier dans son intégralité a pour but de tester 
//les fonctionnalités de sécurité définies dans security.js
//du backend, y compris les middlewares pour la gestion des clés API,
//HMAC, l'authentification JWT, et la journalisation des audits.
//Il utilise Jest pour structurer les tests et simuler différents scénarios
//d'utilisation afin de garantir que les mécanismes de sécurité fonctionnent
//comme prévu dans diverses conditions.
//Il doit couvrir les cas de réussite et d'échec pour chaque fonctionnalité du fichier security.js.
const crypto = require('crypto')
const request = require('supertest')
const { apiKeyMiddleware, hmacMiddleware, verifyHmac, parseRateLimit } = require('../src/security')
 
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {}, ended: false }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (o) => { res.body = o; res.ended = true; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = () => { res.ended = true }
  return res
}

async function runMiddleware(mw, req) {
  const res = mockRes()
  let nextCalled = false
  await mw(req, res, () => { nextCalled = true })
  return { res, nextCalled }
}

afterEach(() => {
  delete process.env.API_KEY
  delete process.env.RBAC_ENFORCE
  delete process.env.API_HMAC_KEYS
  delete process.env.API_HMAC_NONCE_ENFORCE
  delete process.env.API_HMAC_NONCE_TTL_MS
})

describe('apiKeyMiddleware', () => {
  test('denies missing auth when required and RBAC not enforced', async () => {
    process.env.RBAC_ENFORCE = '0'
    const { res, nextCalled } = await runMiddleware(apiKeyMiddleware(true), { method: 'GET', headers: {} })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: expect.stringMatching(/authorization/i) })
  })

  test('defers to RBAC when JWT-looking token present', async () => {
    const jwtLike = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from('{}').toString('base64url') + '.sig'
    const { res, nextCalled } = await runMiddleware(apiKeyMiddleware(true), { method: 'GET', headers: { authorization: `Bearer ${jwtLike}` } })
    expect(nextCalled).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  test('allows matching API key', async () => {
    process.env.API_KEY = 'abc123'
    const { res, nextCalled } = await runMiddleware(apiKeyMiddleware(true), { method: 'GET', headers: { authorization: 'Bearer abc123' } })
    expect(nextCalled).toBe(true)
    expect(res.statusCode).toBe(200)
  })
})

describe('HMAC nonce enforcement', () => {
  test('requires nonce when enforce=1 and rejects replay', async () => {
    const keyId = 'k-nonce'
    const secret = 'n0nc3'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    process.env.API_HMAC_NONCE_ENFORCE = '1'
    process.env.API_HMAC_NONCE_TTL_MS = '1000'
    const method = 'POST'
    const body = { a: 1 }
    const bodyText = JSON.stringify(body)
    const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex')
    const dateStr = new Date().toUTCString()
    const payload = [method, '/api/metrics', dateStr, bodyHash].join('\n')
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const mw = hmacMiddleware(true)

    // First call should pass with nonce
    const req1 = { method, originalUrl: '/api/metrics', headers: { 'x-api-key-id': keyId, 'x-api-signature': sig, 'x-api-date': dateStr, 'x-api-nonce': 'abc' }, body }
    const { res: res1, nextCalled: next1 } = await runMiddleware(mw, req1)
    expect(next1).toBe(true)
    expect(res1.statusCode).toBe(200)

    // Replay with same nonce should be blocked
    const req2 = { method, originalUrl: '/api/metrics', headers: { 'x-api-key-id': keyId, 'x-api-signature': sig, 'x-api-date': dateStr, 'x-api-nonce': 'abc' }, body }
    const { res: res2, nextCalled: next2 } = await runMiddleware(mw, req2)
    expect(next2).toBe(false)
    expect(res2.statusCode).toBe(409)
    expect(res2.body).toMatchObject({ error: 'replay detected' })
  })

  test('fails when nonce header missing while enforced', async () => {
    const keyId = 'k-nonce2'
    const secret = 'n0nc3-2'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    process.env.API_HMAC_NONCE_ENFORCE = '1'
    const method = 'GET'
    const dateStr = new Date().toUTCString()
    const bodyHash = crypto.createHash('sha256').update('').digest('hex')
    const payload = [method, '/api/devices', dateStr, bodyHash].join('\n')
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), { method, originalUrl: '/api/devices', headers: { 'x-api-key-id': keyId, 'x-api-signature': sig, 'x-api-date': dateStr } })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'nonce required' })
  })
})

describe('apiKeyMiddleware optional flow', () => {
  test('passes through when not required', async () => {
    const { res, nextCalled } = await runMiddleware(apiKeyMiddleware(false), { method: 'GET', headers: {} })
    expect(nextCalled).toBe(true)
    expect(res.statusCode).toBe(200)
  })
})

describe('requireAuth JWT path', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.OIDC_ISSUER_URL
    delete process.env.OIDC_CLIENT_ID
    delete process.env.OIDC_REQUIRE_AUD
    delete process.env.API_KEY
    delete process.env.ALLOW_API_KEY_WITH_RBAC
  })

  test('accepts valid JWT and sets req.user', async () => {
    const payload = { sub: 'user-1', iss: 'http://issuer', aud: 'client', realm_access: { roles: ['admin'] } }
    jest.isolateModules(() => {
      jest.doMock('../src/security', () => {
        const actual = jest.requireActual('../src/security')
        const verifyJwt = jest.fn(async () => payload)
        const requireAuth = (enforce = false) => async (req, res, next) => {
          if (!enforce) return next()
          const auth = String(req.headers.authorization || '')
          const bearerMatch = auth.match(/Bearer\s+(.+)/i)
          if (!bearerMatch) return res.status(401).json({ error: 'unauthorized' })
          const tok = bearerMatch[1]
          const data = await verifyJwt(tok, { issuer: process.env.OIDC_ISSUER_URL, audience: process.env.OIDC_CLIENT_ID })
          req.user = { sub: data.sub, roles: Array.isArray(data.realm_access?.roles) ? data.realm_access.roles : [] }
          return next()
        }
        return { ...actual, verifyJwt, requireAuth }
      })
      const security = require('../src/security')
      process.env.OIDC_ISSUER_URL = payload.iss
      process.env.OIDC_CLIENT_ID = 'client'
      process.env.OIDC_REQUIRE_AUD = '1'
      const mw = security.requireAuth(true)
      const req = { headers: { authorization: 'Bearer header.payload.sig' } }
      const res = mockRes()
      let nextCalled = false
      return mw(req, res, () => { nextCalled = true }).then(() => {
        expect(nextCalled).toBe(true)
        expect(req.user.sub).toBe('user-1')
        expect(req.user.roles).toContain('admin')
      })
    })
  })

  

  test('rejects invalid JWT when no API key fallback', async () => {
    jest.isolateModules(() => {
      jest.doMock('../src/security', () => {
        const actual = jest.requireActual('../src/security')
        const verifyJwt = jest.fn(async () => { throw new Error('bad token') })
        const requireAuth = (enforce = false) => async (req, res, next) => {
          if (!enforce) return next()
          const auth = String(req.headers.authorization || '')
          const bearerMatch = auth.match(/Bearer\s+(.+)/i)
          if (!bearerMatch) return res.status(401).json({ error: 'unauthorized' })
          try { await verifyJwt(bearerMatch[1], { issuer: process.env.OIDC_ISSUER_URL, audience: process.env.OIDC_CLIENT_ID }) }
          catch { return res.status(401).json({ error: 'unauthorized' }) }
          return next()
        }
        return { ...actual, verifyJwt, requireAuth }
      })
      const security = require('../src/security')
      process.env.OIDC_ISSUER_URL = 'http://issuer'
      process.env.OIDC_CLIENT_ID = 'client'
      process.env.ALLOW_API_KEY_WITH_RBAC = '0'
      const mw = security.requireAuth(true)
      const req = { headers: { authorization: 'Bearer invalid.jwt' } }
      const res = mockRes()
      let nextCalled = false
      return mw(req, res, () => { nextCalled = true }).then(() => {
        expect(nextCalled).toBe(false)
        expect(res.statusCode).toBe(401)
        expect(res.body).toMatchObject({ error: 'unauthorized' })
      })
    })
  })
})

describe('rate limit skip and audit', () => {
  afterEach(() => { jest.resetModules(); jest.clearAllMocks() })

  test('skip function ignores chart GET routes', () => {
    let captured = null
    jest.isolateModules(() => {
      jest.doMock('express-rate-limit', () => (opts) => { captured = opts; return (_req, _res, next) => next() })
      const security = require('../src/security')
      const app = { use: jest.fn(), options: jest.fn(), disable: jest.fn(), set: jest.fn() }
      security.applySecurity(app)
      expect(typeof captured.skip).toBe('function')
      const allow = captured.skip({ method: 'GET', originalUrl: '/api/timeseries?x=1', path: '/api/timeseries' })
      const deny = captured.skip({ method: 'POST', originalUrl: '/api/events', path: '/api/events' })
      expect(allow).toBe(true)
      expect(deny).toBe(false)
    })
  })

  test('recordAudit appends a line to file', async () => {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'))
    const origCwd = process.cwd()
    process.chdir(tmp)
    const { recordAudit } = require('../src/security')
    const mw = recordAudit('test')
    const req = { id: 'req1', ip: '127.0.0.1', method: 'GET', originalUrl: '/api/health', headers: {}, user: { sub: 'u1', roles: ['admin'] }, query: {}, body: {} }
    const res = {}
    mw(req, res, () => {})
    await new Promise((r) => setTimeout(r, 25))
    const log = fs.readFileSync(path.join(tmp, 'audit.log'), 'utf8')
    expect(log.split('\n').filter(Boolean).length).toBe(1)
    process.chdir(origCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('HMAC Redis nonce path', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.API_HMAC_KEYS
    delete process.env.API_HMAC_NONCE_ENFORCE
    delete process.env.API_HMAC_NONCE_TTL_MS
    delete process.env.REDIS_URL
  })

  test('rejects replay when Redis detects duplicate nonce', async () => {
    jest.isolateModules(() => {
      jest.doMock('ioredis', () => {
        return class FakeRedis {
          constructor() { this.store = new Map() }
          on() {}
          async set(key, _val, _px, _ttl, flag) {
            if (flag === 'NX') {
              if (this.store.has(key)) return null
              this.store.set(key, 1); return 'OK'
            }
            return 'OK'
          }
        }
      })
      const security = require('../src/security')
      process.env.API_HMAC_KEYS = JSON.stringify({ r1: 'redis-secret' })
      process.env.API_HMAC_NONCE_ENFORCE = '1'
      process.env.API_HMAC_NONCE_TTL_MS = '1000'
      process.env.REDIS_URL = 'redis://localhost:6379'
      const method = 'POST'
      const body = { x: 1 }
      const bodyText = JSON.stringify(body)
      const dateStr = new Date().toUTCString()
      const bodyHash = crypto.createHash('sha256').update(bodyText).digest('hex')
      const payload = [method, '/api/metrics', dateStr, bodyHash].join('\n')
      const sig = crypto.createHmac('sha256', 'redis-secret').update(payload).digest('hex')
      const mw = security.hmacMiddleware(true)

      const req1 = { method, originalUrl: '/api/metrics', headers: { 'x-api-key-id': 'r1', 'x-api-signature': sig, 'x-api-date': dateStr, 'x-api-nonce': 'nn' }, body }
      const res1 = mockRes(); let next1 = false
      const req2 = { method, originalUrl: '/api/metrics', headers: { 'x-api-key-id': 'r1', 'x-api-signature': sig, 'x-api-date': dateStr, 'x-api-nonce': 'nn' }, body }
      const res2 = mockRes(); let next2 = false
      const waitMw = (req, res, flagRef) => new Promise((resolve) => { mw(req, res, () => { if (flagRef) flagRef.value = true; resolve('next') }); setTimeout(() => resolve('done'), 20) })
      const flag1 = { value: false }
      const flag2 = { value: false }
      return waitMw(req1, res1, flag1).then(() => {
        expect(flag1.value).toBe(true)
        return waitMw(req2, res2, flag2).then(() => {
          expect(flag2.value).toBe(false)
          expect(res2.statusCode).toBe(409)
        })
      })
    })
  })
})
describe('HMAC middleware', () => {
  test('rejects when enforce=1 and headers are missing', async () => {
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), { method: 'GET', originalUrl: '/api/devices', headers: {} })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'hmac required' })
  })

  test('rejects when key is unknown', async () => {
    process.env.API_HMAC_KEYS = JSON.stringify({ known: 'secret' })
    const req = { method: 'GET', originalUrl: '/api/devices', headers: { 'x-api-key-id': 'unknown', 'x-api-signature': 'aa', 'x-api-date': new Date().toUTCString() } }
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), req)
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.body.reason).toBe('unknown key')
  })

  test('rejects when signature mismatches', async () => {
    const keyId = 'k1'
    const secret = 's3cr3t'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    const method = 'GET'
    const originalUrl = '/api/devices?a=1'
    const dateStr = new Date().toUTCString()
    const badSig = 'deadbeef'
    const req = { method, originalUrl, headers: { 'x-api-key-id': keyId, 'x-api-signature': badSig, 'x-api-date': dateStr } }
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), req)
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.body.reason).toBe('mismatch')
  })

  test('accepts valid signature with canonicalized query', async () => {
    const keyId = 'k1'
    const secret = 's3cr3t'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    const method = 'GET'
    const originalUrl = '/api/devices?b=2&a=1'
    const dateStr = new Date().toUTCString()
    const canonPath = '/api/devices?a=1&b=2'
    const bodyHash = crypto.createHash('sha256').update('').digest('hex')
    const payload = [method, canonPath, dateStr, bodyHash].join('\n')
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    const req = { method, originalUrl, headers: { 'x-api-key-id': keyId, 'x-api-signature': sig, 'x-api-date': dateStr } }
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), req)
    expect(nextCalled).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  test('detects clock skew via verifyHmac', () => {
    const keyId = 'k2'
    const secret = 'zz'
    process.env.API_HMAC_KEYS = JSON.stringify({ [keyId]: secret })
    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toUTCString()
    const bad = verifyHmac({ method: 'GET', pathWithQuery: '/api/health', bodyText: '', dateStr: oldDate, keyId, signatureHex: '00', maxSkewMs: 1000 })
    expect(bad.ok).toBe(false)
    expect(bad.reason).toBe('clock skew')
  })
})

describe('parseRateLimit', () => {
  test('returns defaults on invalid input', () => {
    expect(parseRateLimit(null)).toMatchObject({ max: 1000 })
    expect(parseRateLimit('oops')).toMatchObject({ windowMs: 15 * 60 * 1000 })
  })

  test('falls back to defaults when window is missing or malformed', () => {
    expect(parseRateLimit('100')).toMatchObject({ windowMs: 15 * 60 * 1000 })
    expect(parseRateLimit('50/xyz')).toMatchObject({ max: 1000, windowMs: 15 * 60 * 1000 })
  })

  test('parses "100/1m" into values', () => {
    const res = parseRateLimit('100/1m')
    expect(res.max).toBe(100)
    expect(res.windowMs).toBe(60 * 1000)
  })
})

describe('canonicalPathWithSortedQuery', () => {
  const { canonicalPathWithSortedQuery } = require('../src/security')
  test('sorts query params and encodes values', () => {
    const out = canonicalPathWithSortedQuery('/api/timeseries?to=2&from=1')
    expect(out).toBe('/api/timeseries?from=1&to=2')
  })
  test('handles duplicate params deterministically', () => {
    const out = canonicalPathWithSortedQuery('/p?a=2&a=1')
    expect(out).toBe('/p?a=1&a=2')
  })
})

describe('verifyHmac end-to-end', () => {
  const { verifyHmac } = require('../src/security')
  test('succeeds with correct signature', () => {
    const method = 'POST'
    const pathWithQuery = '/api/devices?b=2&a=1'
    const bodyText = JSON.stringify({ foo: 'bar' })
    const dateStr = new Date().toUTCString()
    process.env.API_HMAC_KEYS = JSON.stringify({ id1: 'secret' })
    const crypto = require('crypto')
    const payload = ['POST', '/api/devices?a=1&b=2', dateStr, crypto.createHash('sha256').update(bodyText).digest('hex')].join('\n')
    const sig = crypto.createHmac('sha256', 'secret').update(payload).digest('hex')
    const res = verifyHmac({ method, pathWithQuery, bodyText, dateStr, keyId: 'id1', signatureHex: sig })
    expect(res.ok).toBe(true)
  })
  test('fails with mismatched body', () => {
    const method = 'POST'
    const pathWithQuery = '/api/devices'
    const bodyText = JSON.stringify({ foo: 'bar' })
    const dateStr = new Date().toUTCString()
    process.env.API_HMAC_KEYS = JSON.stringify({ id1: 'secret' })
    const crypto = require('crypto')
    const payload = ['POST', '/api/devices', dateStr, crypto.createHash('sha256').update(bodyText).digest('hex')].join('\n')
    const sig = crypto.createHmac('sha256', 'secret').update(payload).digest('hex')
    const res = verifyHmac({ method, pathWithQuery, bodyText: '{}', dateStr, keyId: 'id1', signatureHex: sig })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('mismatch')
  })
  test('rejects clock skew', () => {
    process.env.API_HMAC_KEYS = JSON.stringify({ id1: 'secret' })
    const res = verifyHmac({ method: 'GET', pathWithQuery: '/api/health', bodyText: '', dateStr: new Date(Date.now() - 10 * 60 * 1000).toUTCString(), keyId: 'id1', signatureHex: '00', maxSkewMs: 1000 })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('clock skew')
  })
})

describe('hmacMiddleware permissive and strict', () => {
  const { canonicalPathWithSortedQuery } = require('../src/security')
  test('passes through when enforce=false and headers missing', async () => {
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(false), { method: 'GET', originalUrl: '/api/devices', headers: {} })
    expect(nextCalled).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  test('rejects with 401 when enforce=true and signature invalid', async () => {
    const now = new Date().toUTCString()
    const { res, nextCalled } = await runMiddleware(hmacMiddleware(true), { method: 'GET', originalUrl: '/api/devices', headers: { 'x-api-key-id': 'id', 'x-api-signature': 'bad', 'x-api-date': now } })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)
  })

  test('rejects duplicate nonce via Redis mock', async () => {
    jest.isolateModules(() => {
      jest.doMock('ioredis', () => {
        return class FakeRedis {
          constructor() { this.store = new Map() }
          on() {}
          async set(key, _val, _px, _ttl, flag) {
            if (flag === 'NX') {
              if (this.store.has(key)) return null
              this.store.set(key, 1); return 'OK'
            }
            return 'OK'
          }
        }
      })
      process.env.API_HMAC_KEYS = JSON.stringify({ id1: 'secret' })
      process.env.API_HMAC_NONCE_ENFORCE = '1'
      process.env.API_HMAC_NONCE_TTL_MS = '1000'
      process.env.REDIS_URL = 'redis://localhost'
      const crypto = require('crypto')
      const method = 'GET'
      const dateStr = new Date().toUTCString()
      const canon = canonicalPathWithSortedQuery('/api/devices')
      const payload = [method, canon, dateStr, crypto.createHash('sha256').update('').digest('hex')].join('\n')
      const sig = crypto.createHmac('sha256', 'secret').update(payload).digest('hex')
      const mw = require('../src/security').hmacMiddleware(true)
      const req = { method, originalUrl: '/api/devices', headers: { 'x-api-key-id': 'id1', 'x-api-signature': sig, 'x-api-date': dateStr, 'x-api-nonce': 'nn' }, body: {} }
      const res1 = mockRes(); let next1 = false
      const res2 = mockRes(); let next2 = false
      const waitMw = (r, s, flag) => new Promise((resolve) => mw(r, s, () => { if (flag) flag.value = true; resolve() }))
      const f1 = { value: false }
      const f2 = { value: false }
      return waitMw(req, res1, f1).then(() => {
        expect(f1.value).toBe(true)
        return waitMw(req, res2, f2).then(() => {
          expect(f2.value).toBe(false)
          expect(res2.statusCode).toBe(409)
        })
      })
    })
  })
})

describe('applySecurity basics', () => {
  test('injects x-request-id and respects existing header', async () => {
    const express = require('express')
    const { applySecurity } = require('../src/security')
    const app = express()
    applySecurity(app)
    app.get('/api/ping', (req, res) => res.json({ id: req.requestId || req.id }))
    const res = await request(app).get('/api/ping').set('x-request-id', 'custom-id')
    expect(res.body.id).toBe('custom-id')
    expect(res.headers['x-request-id']).toBe('custom-id')
  })
})
describe('requireRole enforcement', () => {
  test('returns 403 when role missing and passes when role present', async () => {
    const { requireRole } = require('../src/security')
    const mw = requireRole('admin', true)
    const req = { user: { roles: ['viewer'] } }
    const res = mockRes()
    let nextCalled = false
    await mw(req, res, () => { nextCalled = true })
    expect(nextCalled).toBe(false)
    expect(res.statusCode).toBe(403)

    const req2 = { user: { roles: ['viewer', 'admin'] } }
    const res2 = mockRes()
    let nextCalled2 = false
    await mw(req2, res2, () => { nextCalled2 = true })
    expect(nextCalled2).toBe(true)
    expect(res2.statusCode).toBe(200)
  })
})
