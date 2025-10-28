// Kienlab HTTP multi-device polling adapter.
// Polls per device: <KIENLAB_BASE>/api/raw/?length=-<LEN>&dev_id=<ID>
// Optional auth via KIENLAB_AUTH_SCHEME/ KIENLAB_API_KEY
const { updateIotMetrics } = require('../../metrics')

function parseList(val) {
  return String(val || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
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

function buildUrl(base, devId, length) {
  const b = String(base || '').replace(/\/$/, '')
  const q = `?length=-${length}&dev_id=${encodeURIComponent(devId)}`
  // try common raw endpoints
  return [ `${b}/api/raw/${q}`, `${b}/api/master/raw/${q}` ]
}

function buildHeaders() {
  const headers = { 'accept': 'application/json' }
  const scheme = process.env.KIENLAB_AUTH_SCHEME || ''
  const key = process.env.KIENLAB_API_KEY || ''
  if (scheme && key) headers['authorization'] = `${scheme} ${key}`
  return headers
}

function mapRow(row) {
  // derive timestamp
  let ts = row.ts
  if (!Number.isFinite(ts)) ts = toMillis(row.timestamp)
  if (!Number.isFinite(ts)) ts = toMillis(row.localtime)
  if (!Number.isFinite(ts)) ts = toMillis(row.time)
  if (!Number.isFinite(ts) && Array.isArray(row)) ts = Number(row[0])
  // extract values
  let values = row.values
  if (!values) {
    values = {}
    for (const k of Object.keys(row)) {
      if (['ts','timestamp','localtime','time','_id','dev_id','deviceId'].includes(k)) continue
      values[k] = row[k]
    }
  }
  // optional mapping via env JSON
  let MAP = {}
  try { MAP = JSON.parse(process.env.KIENLAB_MAP || '{}') } catch {}
  for (const key of ['U','I','P','E','F','pf','temp','humid']) {
    const v = process.env[`KIENLAB_MAP_${key}`]
    if (v) MAP[key] = v
  }
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

async function fetchJson(url, headers) {
  const f = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default
  const res = await f(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function normalizePayload(payload) {
  let rows = []
  if (Array.isArray(payload)) rows = payload.map(mapRow)
  else if (payload && Array.isArray(payload.data)) rows = payload.data.map(mapRow)
  return rows.filter(r => Number.isFinite(r.ts))
}

function startKienlabHttp({ store }) {
  const base = process.env.KIENLAB_BASE
  const list = parseList(process.env.KIENLAB_DEVICES)
  const length = Number(process.env.KIENLAB_LENGTH || 200)
  const pollMs = Math.max(1000, Number(process.env.KIENLAB_POLL_MS || 5000))
  const debug = String(process.env.KIENLAB_DEBUG || '0') === '1'
  const maxInit = Math.max(0, Number(process.env.KIENLAB_MAX_INIT_ROWS || 500))
  if (!base || !list.length) {
    console.warn('[kienlab] KIENLAB_BASE or KIENLAB_DEVICES not set; adapter idle')
    return { id: 'kienlab-idle', stop: () => {} }
  }
  const headers = buildHeaders()
  let alive = true
  const timers = new Map()
  const lastTsByDev = new Map() // devId -> last ingested ts (ms)
  const inFlight = new Set()

  async function pollDevice(devId) {
    if (inFlight.has(devId)) return
    inFlight.add(devId)
    const cands = buildUrl(base, devId, length)
    let payload = null
    for (const url of cands) {
      try {
        if (debug) console.log('[kienlab] fetch', url)
        payload = await fetchJson(url, headers); break
      } catch (e) {
        if (debug) console.warn('[kienlab] fetch error', url, e && e.message ? e.message : e)
      }
    }
    if (!payload) { inFlight.delete(devId); return }
    let rows = normalizePayload(payload)
    // Keep only strictly newer rows than lastTs (dedupe across polls)
    const last = lastTsByDev.get(devId) || 0
    if (last > 0) rows = rows.filter(r => Number(r.ts) > last)
    // On first run, optionally cap initial load to avoid OOM
    if (last === 0 && maxInit > 0 && rows.length > maxInit) rows = rows.slice(-maxInit)
    if (debug) console.log(`[kienlab] dev=${devId} rows=${rows.length} (last=${last})`)
    let maxTs = last
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.values || {})) {
        if (v == null || !Number.isFinite(Number(v))) continue
        store.addPoint(devId, k, Number(r.ts), Number(v))
      }
      updateIotMetrics(r.values)
      if (Number(r.ts) > maxTs) maxTs = Number(r.ts)
    }
    if (maxTs > last) lastTsByDev.set(devId, maxTs)
    inFlight.delete(devId)
  }

  function schedule(devId) {
    const t = setTimeout(async function run() {
      try { await pollDevice(devId) } catch {}
      if (!alive) return
      schedule(devId)
    }, pollMs)
    timers.set(devId, t)
  }

  // Kick an immediate first poll, then schedule periodic
  for (const id of list) {
    pollDevice(id).catch(()=>{})
    schedule(id)
  }

  return { id: 'kienlab-http', stop: () => { alive = false; for (const t of timers.values()) clearTimeout(t) } }
}

module.exports = { startKienlabHttp }
