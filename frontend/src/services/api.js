import { masterClient, apiRaw } from '../lib/masterClient.js'
import { getAccessToken, refreshAccessToken } from './oidc.js'

const EXPLICIT_BASE = import.meta.env.VITE_API_BASE
const IS_PROD = import.meta.env.PROD
const API_KEY = import.meta.env.VITE_API_KEY || ''
const HMAC_KEY_ID = import.meta.env.VITE_API_HMAC_KEY_ID || ''
const HMAC_SECRET = import.meta.env.VITE_API_HMAC_SECRET || ''
let resolvedBase = null
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 10000)
// Global concurrency limiter to avoid exhausting browser resources
const MAX_CONCURRENCY = 8
let inFlight = 0
const waiters = []
function acquire() {
  if (inFlight < MAX_CONCURRENCY) { inFlight++; return Promise.resolve() }
  return new Promise((resolve) => waiters.push(resolve))
}
function release() {
  inFlight = Math.max(0, inFlight - 1)
  const next = waiters.shift()
  if (next) { inFlight++; next() }
}

function hmacHeaders(method, path, bodyText) {
  if (!HMAC_KEY_ID || !HMAC_SECRET) return {}
  try {
    const algo = 'SHA-256'
    const date = new Date().toUTCString()
    // Compute body SHA-256 hex for canonical payload
    const enc = new TextEncoder()
    const bodyBytes = enc.encode(bodyText || '')
    const bodyHashPromise = crypto?.subtle?.digest ? crypto.subtle.digest('SHA-256', bodyBytes).then(buf => Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('')) : Promise.resolve('')
    const payloadPromise = bodyHashPromise.then(bh => [method.toUpperCase(), path, date, bh].join('\n'))
    const keyData = enc.encode(HMAC_SECRET)
    const nonce = (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2))
    if (crypto?.subtle?.importKey) {
      return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: algo }, false, ['sign'])
        .then(async (k) => {
          const payload = await payloadPromise
          return crypto.subtle.sign('HMAC', k, enc.encode(payload))
        })
        .then(sig => {
          const b = new Uint8Array(sig)
          const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
          return { 'x-api-key-id': HMAC_KEY_ID, 'x-api-date': date, 'x-api-signature': hex, 'x-api-nonce': nonce }
        })
        .catch(() => ({}))
    }
  } catch {} 
  return {}
}

function canonicalizePath(path) {
  try {
    const [p, q] = String(path || '').split('?')
    if (!q) return p || '/'
    const usp = new URLSearchParams(q)
    const pairs = []
    for (const [k, v] of usp.entries()) pairs.push([k, v])
    pairs.sort((a, b) => a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1))
    const enc = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    return enc ? `${p || '/'}?${enc}` : (p || '/')
  } catch { return path || '/' }
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)) }

async function tryFetch(base, path, params) {
  const url = `${base}${path}`
  const method = (params && params.method) || 'GET'
  const bodyText = params && typeof params.body === 'string' ? params.body : ''
  const canon = canonicalizePath(path)
  const extraHmac = await hmacHeaders(method, canon, bodyText)
  const token = getAccessToken()
  let attempt = 0
  if (!IS_PROD) console.log('Fetching:', url)
  while (true) {
    await acquire()
    let res
    // AbortController with timeout (can be overridden by params.signal)
    const controller = new AbortController()
    const timeoutMs = Number(params?.timeoutMs || DEFAULT_TIMEOUT_MS)
    const timer = setTimeout(() => { try { controller.abort() } catch {} }, Math.max(0, timeoutMs))
    try {
      res = await fetch(url, {
        ...params,
        headers: {
          'content-type': 'application/json',
          ...(API_KEY ? { 'authorization': `Bearer ${API_KEY}` } : {}),
          ...(token ? { 'authorization': `Bearer ${token}` } : {}),
          ...extraHmac,
          ...(params && params.headers ? params.headers : {}),
        },
        credentials: 'omit',
        cache: 'no-store',
        signal: params?.signal || controller.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      release()
      // Network error: retry a few times with backoff
      if (attempt < 3) { attempt++; await sleep(200 * attempt); continue }
      throw e
    }
    clearTimeout(timer)
    if (res.status === 429 && attempt < 3) {
      release()
      // Backoff on rate limits
      attempt++; await sleep(300 * attempt); continue
    }
    if (res.status === 401) {
      // Try to refresh the token once, then retry
      if (attempt === 0) {
        try { const ok = await refreshAccessToken(); if (ok) { attempt++; release(); await sleep(50); continue } } catch {}
      }
    }
    if (!res.ok) {
      release()
      const bodyText = await res.text().catch(()=> '')
      const err = new Error(`HTTP ${res.status}: ${bodyText}`)
      err.status = res.status
      err.body = bodyText
      err.isApiError = true
      if (res.status === 401) err.code = 'unauthorized'
      else if (res.status === 403) err.code = 'forbidden'
      else if (res.status === 404) err.code = 'not_found'
      throw err
    }
    const ct = res.headers.get('content-type') || ''

    try { return ct.includes('application/json') ? await res.json() : await res.text() }
    finally { release() }
  }
}

function candidateBases() {
  if (IS_PROD) return ['']
  if (EXPLICIT_BASE) return [EXPLICIT_BASE]
  const arr = []
  // First, try relative (same origin, nginx proxy)
  arr.push('')
  // Then try current origin without port (useful when served behind proxies)
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    if (origin) arr.push(origin)
  }
  // Finally, scan localhost dev ports
  const host = (typeof window !== 'undefined' && window.location.hostname) || 'localhost'
  const protocol = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'https' : 'http'
  for (let p = 4000; p <= 4010; p++) arr.push(`${protocol}://${host}:${p}`)
  return arr
}

async function http(path, params) {
  // Prefer previously resolved base, but fall back to scanning if it fails.
  const cands = candidateBases()
  const bases = resolvedBase ? [resolvedBase, ...cands.filter(b => b !== resolvedBase)] : cands
  let lastErr
  for (const b of bases) {
    try {
      const out = await tryFetch(b, path, params)
      resolvedBase = b
      return out
    } catch (e) {
      lastErr = e
      // If the cached base fails, clear it so next call rescans
      if (resolvedBase === b) resolvedBase = null
    }
  }
  throw lastErr || new Error('No backend reachable')
}

export function getBaseUrl() {
  // Preserve empty-string base ('') for relative URLs
  if (resolvedBase !== null && resolvedBase !== undefined) return resolvedBase
  if (EXPLICIT_BASE !== null && EXPLICIT_BASE !== undefined) return EXPLICIT_BASE
  return 'http://localhost:4000'
}

function buildQualityParams(params = {}) {
  const q = new URLSearchParams()
  if (params.from != null) q.set('from', String(params.from))
  if (params.to != null) q.set('to', String(params.to))
  if (params.bucketMs != null) q.set('bucketMs', String(params.bucketMs))
  if (params.detail != null) q.set('detail', String(params.detail))
  return q
}

async function qualityMaster(params = {}) {
  const now = Date.now()
  const from = params.from != null ? Number(params.from) : (now - 24 * 60 * 60 * 1000)
  const to = params.to != null ? Number(params.to) : now
  const bucketMs = params.bucketMs != null ? Number(params.bucketMs) : 60 * 60 * 1000
  const detail = params.detail
  const devices = await masterClient.devices()
  const metrics = await masterClient.metrics()
  const items = []
  const expected = bucketMs > 0 ? Math.max(0, Math.floor((to - from) / bucketMs)) : 0
  for (const device of devices) {
    let raw = []
    try {
      const spanMs = to - from
      const estPoints = bucketMs > 0 ? Math.ceil(spanMs / bucketMs) : 0
      const length = params.length != null ? Number(params.length) : Math.max(500, estPoints * 4)
      raw = await apiRaw({ devId: device.id, length })
    } catch {
      raw = []
    }
    const metricInfo = new Map()
    for (const m of metrics) metricInfo.set(m.key, { buckets: new Set(), lastTs: null })
    for (const row of raw) {
      const ts = Number(row.ts)
      if (!Number.isFinite(ts) || ts < from || ts > to) continue
      const values = row.values || {}
      for (const metric of metrics) {
        const info = metricInfo.get(metric.key)
        if (!info) continue
        const val = Number(values[metric.key])
        if (!Number.isFinite(val)) continue
        info.lastTs = ts
        if (bucketMs > 0) {
          const bucket = Math.floor(ts / bucketMs) * bucketMs
          info.buckets.add(bucket)
        }
      }
    }
    for (const metric of metrics) {
      const info = metricInfo.get(metric.key) || { buckets: new Set(), lastTs: null }
      const present = info.buckets.size
      const lastTs = info.lastTs
      const item = {
        deviceId: device.id,
        deviceName: device.name,
        metricKey: metric.key,
        unit: metric.unit,
        lastTs,
        freshnessMs: lastTs != null ? Math.max(0, now - lastTs) : null,
        bucketsPresent: present,
        bucketsExpected: expected,
        completeness: expected > 0 ? present / expected : 1,
        gaps: Math.max(0, expected - present),
      }
      if (detail === '1') item.presentBuckets = Array.from(info.buckets).sort((a, b) => a - b)
      items.push(item)
    }
  }
  return { from, to, bucketMs, items }
}

const MODE = (import.meta.env.VITE_DATA_SOURCE || '').toLowerCase()

export const api = MODE === 'master' && masterClient.isEnabled
  ? {
      async devices() { const devices = await masterClient.devices(); return { devices } },
      async metrics(_deviceId) { const metrics = await masterClient.metrics(); return { metrics } },
      async kpis(deviceId, from, to) { return masterClient.kpis({ deviceId, from, to }) },
      async timeseries(deviceId, metricKey, params={}) { return masterClient.series({ deviceId, metricKey, ...params }) },
      async diagnostics() { return masterClient.diagnostics() },
      async quality(params={}) { return qualityMaster(params) },
      exportCsvUrl() { return '#' },
      async notify(alert) { return http('/api/notify', { method: 'POST', body: JSON.stringify(alert) }) },
    }
  : {
      devices: () => http('/api/devices'),
      metrics: (deviceId) => http(`/api/metrics${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}`: ''}`),
      kpis: (deviceId, from, to) => http(`/api/kpis?deviceId=${encodeURIComponent(deviceId)}${from?`&from=${from}`:''}${to?`&to=${to}`:''}`),
      timeseries: (deviceId, metricKey, params={}) => {
        const q = new URLSearchParams({ deviceId, metricKey, ...Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined)) })
        return http(`/api/timeseries?${q.toString()}`)
      },
      diagnostics: () => http('/api/diagnostics'),
      // Assets meta
      getAssetsMeta: () => http('/api/assets/meta'),
      putAssetsMeta: (updates, replace=false) => http('/api/assets/meta', { method: 'PUT', body: JSON.stringify({ updates, replace }) }),
      // Thresholds
      getThresholds: () => http('/api/settings/thresholds'),
      putThresholds: (payload) => http('/api/settings/thresholds', { method: 'PUT', body: JSON.stringify(payload) }),
      thresholdsEffective: (deviceId) => http(`/api/thresholds/effective?deviceId=${encodeURIComponent(deviceId)}`),
      // Admin helpers
      adminStatus: () => http('/api/admin/status'),
      adminPing: (key) => fetch(`${getBaseUrl()}/api/admin/ping`, { headers: { 'authorization': key ? `Bearer ${key}` : '' } }).then(r=>r.json()),
      hmacTest: () => http('/api/admin/hmac-test', { method: 'POST', body: JSON.stringify({}) }),
      adminAlertsTest: (payload) => http('/api/alerts/test', { method: 'POST', body: JSON.stringify(payload||{}) }),
      exportPdf: (deviceId, from, to, title) => {
        const q = new URLSearchParams({ deviceId })
        if (from) q.set('from', String(from))
        if (to) q.set('to', String(to))
        if (title) q.set('title', title)
        return fetch(`${getBaseUrl()}/api/export.pdf?${q.toString()}`)
      },
      exportCsvUrl: (deviceId, metricKey, from, to) => {
        const q = new URLSearchParams({ deviceId, metricKey })
        if (from) q.set('from', String(from))
        if (to) q.set('to', String(to))
        return `${getBaseUrl()}/api/export.csv?${q.toString()}`
      },
      quality: async (params={}) => {
        const q = buildQualityParams(params)
        const path = `/api/quality${q.toString() ? `?${q.toString()}` : ''}`
        return http(path)
      },
      async notify(alert) { return http('/api/notify', { method: 'POST', body: JSON.stringify(alert) }) },
    }
