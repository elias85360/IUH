const http = require('http')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const compression = require('compression')
require('dotenv').config()

const config = require('./config')
const { DataStore } = require('./datastore')
const { buildApi } = require('./api')
const { attachSocket } = require('./socket')
const { startIngestion } = require('./sources')
const { applySecurity } = require('./security')
const { createMailerFromEnv, createRoutersFromEnv } = require('./notify')
const { initMetrics } = require('./metrics')
const { validateEnv } = require('./envValidation')

// Fillet de sécurité globale sur le process Node.js
process.on('unhandledRejection', (err) => {
  try {
    console.error('[unhandledRejection]', err);
  } catch {}
});

process.on('uncaughtException', (err) => {
  try {
    console.error('[uncaughtException]', err);
  } catch {}
});

validateEnv({ strict: process.env.NODE_ENV === 'production' })

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
  // Compression and body limits
  app.use(compression())
  app.use(express.json({ limit: '200kb' }))
  app.use(express.urlencoded({ extended: false, limit: '200kb' }))

  // Allow overriding device list from KIENLAB_DEVICES for external ingestion
  let devices = config.devices
  try {
    const ids = String(process.env.KIENLAB_DEVICES || '')
      .split(',').map(s=>s.trim()).filter(Boolean)
    if (ids.length) devices = ids.map((id, i) => ({ id, name: `Kienlab ${i+1}`, type: 'kienlab', room: '-', tags: ['kienlab'] }))
  } catch {}
  const store = new DataStore({ devices, metrics: config.metrics })
  const mailer = createMailerFromEnv()
  const routers = createRoutersFromEnv()
  app.set('alertRouters', routers)
  buildApi({ app, store, mailer })

  app.use((req, res, next, err) => {
    try {
      console.error('[http:error]', {
        method: req.method,
        path: req.originalUrl,
        message: err && err.message ? err.message : String(err),
      })
    } catch {}

    if (res.headersSent) return next(err)

    const status = 
      err && Number.isInteger(err.status)
        ? err.statusCode
        : 500
    const payload = { error: 'internal_error' }
    if (process.env.NODE_ENV !== 'production') {
      payload.details = String(err && err.message ? err.message : err)
    }

    res.status(status).json(payload)
  })

  // Start ingestion (mock/http/ws/mqtt) and optional emailer
  const gen = startIngestion({ store, config })
  const stopGen = () => { try { if (gen && typeof gen.stop === 'function') gen.stop() } catch {} }
  if (mailer || routers) {
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
        if (mailer) await mailer.sendAlertEmail(payload)
        if (routers && routers.sendAlert) await routers.sendAlert(payload)
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
  let currentServer = null
  let io = null
  function bind(p, triesLeft) {
    const server = http.createServer(app)
    // HTTP server timeouts
    try {
      server.requestTimeout = 60_000
      server.headersTimeout = 65_000
      server.keepAliveTimeout = 61_000
    } catch {}
    io = attachSocket({ server, store, corsOrigin: config.server.corsOrigin })
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
      currentServer = server
    })
  }
  bind(startPort, maxTries)

  // Graceful shutdown
  async function shutdown() {
    console.log('Shutting down gracefully...')
    // Stop generators and timers
    try { stopGen() } catch {}
    // Close Socket.IO
    try { if (io && typeof io.close === 'function') io.close(() => {}) } catch {}
    // Close HTTP server
    const srv = currentServer
    if (srv) {
      await new Promise((resolve) => {
        try { srv.close(() => resolve()) } catch { resolve() }
      })
    }
    // Fallback hard-exit timer
    setTimeout(() => { process.exit(0) }, 10000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
