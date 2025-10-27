async function startWebSocket({ store }) {
  let WS
  try {
    WS = require('ws') 
  } catch {
    console.error('[ws] Missing dependency ws. Run: npm i ws')
    return { stop: () => {}, id: 'ws-missing' }
  }
  const url = process.env.REMOTE_WS_URL
  if (!url) {
    console.warn('[ws] REMOTE_WS_URL not set; adapter idle')
    return { stop: () => {}, id: 'ws-idle' }
  }
  const ws = new WS(url, { headers: process.env.REMOTE_API_KEY ? { Authorization: `${process.env.REMOTE_AUTH_SCHEME||'Bearer'} ${process.env.REMOTE_API_KEY}` } : undefined })
  const { mapRemoteToPoints } = require('../sourceMapping')
  ws.on('message', (data) => {
    try {
      const payload = JSON.parse(data)
      const points = mapRemoteToPoints(payload)
      for (const p of points) store.addPoint(p.deviceId, p.metricKey, Number(p.ts), Number(p.value))
    } catch (e) { /* ignore malformed */ }
  })
  return { id: 'ws', stop: () => { try { ws.close() } catch {} } }
}

module.exports = { startWebSocket }

