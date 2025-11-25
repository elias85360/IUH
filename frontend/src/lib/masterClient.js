// Kienlab-compatible client wrapper for the frontend.
// When VITE_DATA_SOURCE === 'master', all data is pulled directly from the
// remote master API (raw endpoint), and we emulate aggregates/bucketing client-side.

const env = (typeof globalThis !== 'undefined' && globalThis.import?.meta?.env)
  ? globalThis.import.meta.env
  : (typeof process !== 'undefined' ? process.env || {} : {})

const MODE = (env.VITE_DATA_SOURCE || '').toLowerCase()
const IS_KIENLAB = MODE === 'master'
const DEBUG = (env.VITE_LOG_MASTER === '1')
const MASTER_BASE = (env.VITE_MASTER_BASE || '').replace(/\/$/, '') // e.g. '/kienlab/api' (with Vite proxy) or full https URL
const DEVICES_ENV = (env.VITE_KIENLAB_DEVICES || '').split(',').map(s=>s.trim()).filter(Boolean)
if (IS_KIENLAB && DEBUG) {
  console.info('[masterClient] MODE=master base=', MASTER_BASE, 'devices=', DEVICES_ENV)
}

// Optional mapping via env (either JSON in VITE_KIENLAB_MAP or individual keys)
let MAP = {}
try { 
  MAP = JSON.parse(env.VITE_KIENLAB_MAP || '{}')
} catch {}
for (const key of ['U','I','P','E','F','pf','temp','humid']) {
  const v = env[`VITE_KIENLAB_MAP_${key}`]
  if (v) MAP[key] = v
}

// Default metric definitions (aligned with your backend schema)
export const DEFAULT_METRICS = [
  { key: 'U', unit: 'V', displayName: 'Voltage' },
  { key: 'I', unit: 'A', displayName: 'Current' },
  { key: 'P', unit: 'W', displayName: 'Power' },
  { key: 'E', unit: 'Wh', displayName: 'Energy' },
  { key: 'F', unit: 'Hz', displayName: 'Frequency' },
  { key: 'pf', unit: '', displayName: 'Power Factor' },
  { key: 'temp', unit: '°C', displayName: 'Temp' },
  { key: 'humid', unit: '%', displayName: 'Humid' },
]

function buildCandidates(devId, length) {
  if (!MASTER_BASE) throw new Error('VITE_MASTER_BASE not set')
  const base = MASTER_BASE
/*   const q = `?length=-${length}&dev_id=${encodeURIComponent(devId)}`
 */  // Try common raw endpoints used by Kienlab deployments
  // Avoid constructing bare '/api/raw' if base is already a proxy path like '/kienlab/api'
  const paths = [
    `${base}/raw?length=-${length}&dev_id=${encodeURIComponent(devId)}`
  ]

  /* if (base.match(/\/api$/)) {
    paths.push(`${base.replace(/\/api$/,'')}/raw/${devId}${q}`)
  } else {
    paths.push(`${base}/api/raw/${devId}${q}`)
  }  */
  // Deduplicate
  return Array.from(new Set(paths))
}

// Simple in-memory cache for /raw calls (per devId/length), TTL ~ 15s
const rawCache = new Map() // key -> { ts, promise }
const RAW_TTL = 15 * 1000
const RAW_SESSION_TTL = 60 * 1000

async function httpJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Fetch raw points for a single device from Kienlab
// Kienlab raw shape varies; we expect either an array of objects with per-metric fields
// or { ts, values: { metricKey: value, ... } }
export async function apiRaw({ devId, length = 200 }) {
  if (!IS_KIENLAB) throw new Error('apiRaw only in Kienlab mode')
  const candidates = buildCandidates(devId, length)
  // cache key independent of candidate URL variants
  const key = `${devId}::len=${length}`
  const now = Date.now()
  // SessionStorage cache
  try {
    const sKey = `raw:${key}`
    const sVal = sessionStorage.getItem(sKey)
    if (sVal) {
      const parsed = JSON.parse(sVal)
      if (parsed && parsed.savedAt && (now - parsed.savedAt) < RAW_SESSION_TTL && Array.isArray(parsed.rows)) {
        return parsed.rows
      }
    }
  } catch {}
  const cached = rawCache.get(key)
  if (cached && (now - cached.ts) < RAW_TTL) return cached.promise
  let payload = null
  let lastErr = null
  const promise = (async () => {
    for (const url of candidates) {
      try {
        if (DEBUG) console.debug('[masterClient] fetch', url)
        payload = await httpJson(url)
        console.log('[apiRaw] Payload for', devId, ':', payload)
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (payload == null) {
      if (DEBUG) console.error('[masterClient] Failed to fetch raw from any candidate', candidates, lastErr?.message || lastErr)
      return []
    }
    // Normalize
    let rows = []
    if (Array.isArray(payload)) {
      rows = payload.map(mapRow).filter(r => Number.isFinite(r.ts))
    } else if (payload && payload.data && Array.isArray(payload.data)) {
      rows = payload.data.map(mapRow).filter(r => Number.isFinite(r.ts))
    }
    try { sessionStorage.setItem(`raw:${key}`, JSON.stringify({ savedAt: Date.now(), rows })) } catch {}
    return rows
  })()
  rawCache.set(key, { ts: now, promise })
  return promise
}

function toMillis(v) {
  if (v == null) return NaN
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : NaN
  }
  return NaN
}

export function mapRow(row) {
  // Try multiple candidates for timestamp
  let ts = row.ts
  if (!Number.isFinite(ts)) ts = toMillis(row.timestamp)
  if (!Number.isFinite(ts)) ts = toMillis(row.localtime)
  if (!Number.isFinite(ts)) ts = toMillis(row.time)
  if (!Number.isFinite(ts) && Array.isArray(row)) ts = Number(row[0])
  let values = row.values
  if (!values) {
    values = {}
    for (const k of Object.keys(row)) {
      if (['ts','timestamp','localtime','time','_id','dev_id','deviceId'].includes(k)) continue
      values[k] = row[k]
    }
  }
  // Apply mapping & synonyms
  const out = {}
  const synonyms = {
    U: ['U','u','voltage','Voltage','U_L1','U1'],
    I: ['I','i','current','Current','I_L1','I1'],
    P: ['P','p','power','Power','ActivePower','P_L1'],
    E: ['E','e','energy','Energy','Wh','kWh'],
    F: ['F','f','freq','frequency','Frequency'],
    pf: ['pf','PF','powerFactor','cosphi','cosPhi','cosφ'],
    temp: ['temp','temperature','Temp','Temperature','t'],
    humid: ['humid','humidity','Humidity','RH','rh'],
  }
  for (const key of Object.keys(synonyms)) {
    let rawKey = MAP[key]
    if (!rawKey) rawKey = synonyms[key].find(k => Object.prototype.hasOwnProperty.call(values, k))
    if (rawKey && values[rawKey] != null) out[key] = Number(values[rawKey])
  }
  return { ts: Number(ts), values: Object.keys(out).length ? out : values }
}

// Client-side bucketing: average per bucket for numeric fields
export function bucketize(rows, metricKey, from, to, bucketMs) {
  const result = new Map()
  for (const r of rows) {
    const ts = Number(r.ts)
    if (!Number.isFinite(ts)) continue
    if (from && ts < from) continue
    if (to && ts > to) continue
    const v = Number(r.values?.[metricKey])
    if (!Number.isFinite(v)) continue
    const b = bucketMs ? Math.floor(ts / bucketMs) * bucketMs : ts
    let agg = result.get(b)
    if (!agg) { agg = { ts: b, sum: 0, count: 0, min: v, max: v }; result.set(b, agg) }
    agg.sum += v; agg.count += 1
    if (v < agg.min) agg.min = v
    if (v > agg.max) agg.max = v
  }
  return Array.from(result.values()).sort((a,b)=>a.ts-b.ts).map(a => ({ ts: a.ts, value: a.sum / Math.max(1,a.count), min: a.min, max: a.max, count: a.count }))
}

// Public API: devices, metrics, series, kpis, diagnostics
export const masterClient = {
  isEnabled: IS_KIENLAB,
  base: MASTER_BASE,
  devices: async () => {
    // Kienlab n’a pas /devices, on reconstruit depuis l’env
    return DEVICES_ENV.map((id, i) => ({ id, name: `Device ${i+1}`, type: 'kienlab', room: '—', tags: [] }))
  },
  metrics: async () => DEFAULT_METRICS,
  series: async ({ deviceId, metricKey, from, to, bucketMs, length = 1000 }) => {
    const raw = await apiRaw({ devId: deviceId, length })
    const points = bucketize(raw, metricKey, from, to, bucketMs || (from && to ? Math.floor((to-from)/200) : undefined))
    return { deviceId, metricKey, points }
  },
  kpis: async ({ deviceId, from, to }) => {
    const raw = await apiRaw({ devId: deviceId, length: 2000 })
    const out = {}
    for (const m of DEFAULT_METRICS) {
      const pts = bucketize(raw, m.key, from, to)
      if (!pts.length) { out[m.key] = { last: null, min: null, max: null, avg: null, unit: m.unit }; continue }
      const last = pts[pts.length-1].value
      let min = Infinity, max = -Infinity, sum = 0
      for (const p of pts) { if (p.value < min) min = p.value; if (p.value > max) max = p.value; sum += p.value }
      out[m.key] = { last, min, max, avg: sum/pts.length, unit: m.unit }
    }
    return { deviceId, kpis: out }
  },
  diagnostics: async () => ({ devices: DEVICES_ENV.length, metrics: DEFAULT_METRICS.length, seriesKeys: DEVICES_ENV.length * DEFAULT_METRICS.length, totalPoints: 0, uptimeMs: 0, now: Date.now() }),
}
