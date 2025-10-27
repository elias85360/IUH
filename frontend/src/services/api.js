import { masterClient } from '../lib/masterClient.js'
import { getAccessToken, refreshAccessToken } from './oidc.js'

const EXPLICIT_BASE = import.meta.env.VITE_API_BASE
const IS_PROD = import.meta.env.PROD
const API_KEY = import.meta.env.VITE_API_KEY || ''
const HMAC_KEY_ID = import.meta.env.VITE_API_HMAC_KEY_ID || ''
const HMAC_SECRET = import.meta.env.VITE_API_HMAC_SECRET || ''
let resolvedBase = null
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
    const payload = [method.toUpperCase(), path, date, bodyText || ''].join('\n')
    const enc = new TextEncoder()
    const keyData = enc.encode(HMAC_SECRET)
    if (crypto?.subtle?.importKey) {
      return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: algo }, false, ['sign'])
        .then(k => crypto.subtle.sign('HMAC', k, enc.encode(payload)))
        .then(sig => {
          const b = new Uint8Array(sig)
          const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
          return { 'x-api-key-id': HMAC_KEY_ID, 'x-api-date': date, 'x-api-signature': hex }
        })
        .catch(() => ({}))
    }
  } catch {} 
  return {}
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)) }

async function tryFetch(base, path, params) {
  const url = `${base}${path}`
  const method = (params && params.method) || 'GET'
  const bodyText = params && typeof params.body === 'string' ? params.body : ''
  const extraHmac = await hmacHeaders(method, path, bodyText)
  const token = getAccessToken()
  let attempt = 0
  console.log('Fetching:', url)
  while (true) {
    await acquire()
    let res
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
      })
    } catch (e) {
      release()
      // Network error: retry a few times with backoff
      if (attempt < 3) { attempt++; await sleep(200 * attempt); continue }
      throw e
    }
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
      const text = await res.text().catch(()=> '')
      throw new Error(`HTTP ${res.status}: ${text}`)
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
  const bases = resolvedBase ? [resolvedBase] : candidateBases()
  let lastErr
  for (const b of bases) {
    try {
      const out = await tryFetch(b, path, params)
      resolvedBase = b
      return out
    } catch (e) {
      lastErr = e
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

const MODE = (import.meta.env.VITE_DATA_SOURCE || '').toLowerCase()

export const api = MODE === 'master' && masterClient.isEnabled
  ? {
      async devices() { const devices = await masterClient.devices(); return { devices } },
      async metrics(_deviceId) { const metrics = await masterClient.metrics(); return { metrics } },
      async kpis(deviceId, from, to) { return masterClient.kpis({ deviceId, from, to }) },
      async timeseries(deviceId, metricKey, params={}) { return masterClient.series({ deviceId, metricKey, ...params }) },
      async diagnostics() { return masterClient.diagnostics() },
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
      async notify(alert) { return http('/api/notify', { method: 'POST', body: JSON.stringify(alert) }) },
    }
