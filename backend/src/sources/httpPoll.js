const { mapRemoteToPoints } = require('../sourceMapping')

function parseNumber(v, def) {
  const n = Number(v); return Number.isFinite(n) ? n : def
}
 
function startHttpPolling({ store }) {
  const base = process.env.REMOTE_BASE_URL
  const url = process.env.REMOTE_POINTS_URL // full path; ex: http://host/api/points or /api/points appended to base
  const pollMs = parseNumber(process.env.REMOTE_POLL_MS || 2000, 2000)
  if (!base && !url) {
    console.warn('[httpPoll] REMOTE_BASE_URL or REMOTE_POINTS_URL not set; adapter idle')
    return { stop: () => {}, id: 'httpPoll-idle' }
  }
  const full = url ? url : `${base.replace(/\/$/, '')}/api/points`

  const headers = {}
  if (process.env.REMOTE_AUTH_HEADER && process.env.REMOTE_AUTH_VALUE) {
    headers[process.env.REMOTE_AUTH_HEADER] = process.env.REMOTE_AUTH_VALUE
  } else if (process.env.REMOTE_API_KEY) {
    const scheme = process.env.REMOTE_AUTH_SCHEME || 'Bearer'
    headers['authorization'] = `${scheme} ${process.env.REMOTE_API_KEY}`
  }

  let timer = null
  let alive = true
  async function tick() {
    try {
      const res = await fetch(full, { headers })
      if (!res.ok) {
        const text = await res.text().catch(()=> '')
        console.warn('[httpPoll] HTTP', res.status, text)
      } else {
        const payload = await res.json()
        const points = mapRemoteToPoints(payload)
        for (const p of points) {
          if (p && p.deviceId && p.metricKey && p.ts != null && p.value != null) {
            store.addPoint(p.deviceId, p.metricKey, Number(p.ts), Number(p.value))
          }
        }
      }
    } catch (e) {
      console.warn('[httpPoll] error', e && e.message ? e.message : e)
    } finally {
      if (alive) timer = setTimeout(tick, pollMs)
    }
  }
  timer = setTimeout(tick, pollMs)
  return { id: 'httpPoll', stop: () => { alive = false; if (timer) clearTimeout(timer) } }
}

module.exports = { startHttpPolling }

