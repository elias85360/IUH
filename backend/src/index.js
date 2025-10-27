const http = require('http')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
require('dotenv').config()

const config = require('./config')
const { DataStore } = require('./datastore')
const { buildApi } = require('./api')
const { attachSocket } = require('./socket')
const { startIngestion } = require('./sources')
const { applySecurity } = require('./security')
const { createMailerFromEnv } = require('./notify')
const { initMetrics } = require('./metrics')

function main() { 
  const app = express()

  // Metrics and tracing as early as possible
  try { initMetrics(app) } catch {}

  // Trust proxy only when explicitly enabled
  const trustProxy = /^true$/i.test(process.env.TRUST_PROXY || '')
  if (trustProxy) app.set('trust proxy', 1)

  // Flexible CORS
  const rawOrigins = (process.env.CORS_ORIGIN || config.server.corsOrigin || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowAll = rawOrigins.includes('*')
  const allowLocalPattern = rawOrigins.includes('http://localhost:*')
  const corsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (allowAll) return cb(null, true)
      if (rawOrigins.includes(origin)) return cb(null, true)
      if (allowLocalPattern && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true)
      return cb(new Error('Not allowed by CORS'))
    },
    credentials: true,
    optionsSuccessStatus: 204,
  }
  app.use(cors(corsOptions))
  app.options('*', cors(corsOptions))
  console.log('CORS allowed origins:', allowAll ? '*' : rawOrigins.join(', '))

  applySecurity(app)
  app.use(morgan('combined'))
  app.use(express.json())

  // Allow overriding device list from KIENLAB_DEVICES for external ingestion
  let devices = config.devices
  try {
    const ids = String(process.env.KIENLAB_DEVICES || '')
      .split(',').map(s=>s.trim()).filter(Boolean)
    if (ids.length) devices = ids.map((id, i) => ({ id, name: `Kienlab ${i+1}`, type: 'kienlab', room: '-', tags: ['kienlab'] }))
  } catch {}
  const store = new DataStore({ devices, metrics: config.metrics })
  const mailer = createMailerFromEnv()
  buildApi({ app, store, mailer })

  // Start ingestion (mock/http/ws/mqtt) and optional emailer
  const gen = startIngestion({ store, config })
  const stopGen = () => { try { if (gen && typeof gen.stop === 'function') gen.stop() } catch {} }
  process.on('SIGINT', stopGen)
  process.on('SIGTERM', stopGen)
  if (mailer) {
    const minLevel = String(process.env.ALERTS_MIN_LEVEL || 'crit').toLowerCase()
    const rank = { ok: 0, warn: 1, crit: 2 }
    const cooldownMs = Math.max(0, Number(process.env.ALERTS_COOLDOWN_SECONDS || 300) * 1000)
    const lastSent = new Map() // key: deviceId::metricKey::level -> ts
    store.emitter.on('alert', async (payload) => {
      try {
        const r = rank[payload?.level || 'ok'] ?? 0
        const min = rank[minLevel] ?? 2
        if (r < min) return
        const key = `${payload.deviceId}::${payload.metricKey}::${payload.level}`
        const now = Date.now()
        const prev = lastSent.get(key) || 0
        if (cooldownMs && now - prev < cooldownMs) return
        await mailer.sendAlertEmail(payload)
        lastSent.set(key, now)
      } catch (e) { /* ignore */ }
    })
  }

  // Optional: initialize Timescale continuous aggregates and refresh loop
  if (store.enableTsdb) {
    try {
      const tsdb = require('./db/timescale')
      tsdb.initContinuousAggregates().then(()=>{
        const secs = Number(process.env.TSDB_REFRESH_SECONDS || 0)
        if (secs > 0) {
          setInterval(() => {
            const to = new Date()
            const from = new Date(to.getTime() - Math.max(24*60*60*1000, secs*1000))
            tsdb.refreshCaggs(from.toISOString(), to.toISOString()).catch(()=>{})
          }, secs * 1000)
        }
      }).catch(()=>{})
    } catch {}
  }

  // Bind with retry using a fresh server per attempt
  const startPort = Number(process.env.PORT || config.server.port || 4000)
  const maxTries = 10
  function bind(p, triesLeft) {
    const server = http.createServer(app)
    attachSocket({ server, store, corsOrigin: config.server.corsOrigin })
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && triesLeft > 0) {
        console.warn(`Port ${p} in use, trying ${p + 1}...`)
        try { server.close() } catch {}
        setTimeout(() => bind(p + 1, triesLeft - 1), 100)
      } else {
        console.error('Failed to bind server:', err)
        process.exit(1)
      }
    })
    server.listen(p, () => {
      console.log(`Backend listening on http://localhost:${p}`)
      if (!process.env.PORT) process.env.PORT = String(p)
    })
  }
  bind(startPort, maxTries)
}

main()
