// Prometheus metrics pour le backend API et les signaux IoT.
// Utilise prom-client si disponible. Se dégrade proprement sinon.

let client = null
try { client = require('prom-client') } catch { client = null }

const state = {
  enabled: false,
  httpDuration: null,
  httpInFlight: null,
  httpTotal: null,
  httpErrors: null,
  cacheHits: null,
  cacheMisses: null,
  cacheHitRatio: null,
  pointsReturned: null,
  socketConnections: null,
  alertsTotal: null,
  dataFreshness: null,
  dataCompleteness: null,
  dataGaps: null,
  temp: null,
  humid: null,
  U: null,
  I: null,
  P: null,
  E: null,
  F: null,
  pf: null,
  _hitsCount: 0,
  _missesCount: 0,
}

// Initialise l’instrumentation Prometheus et expose /metrics.
// Retourne true si prom-client est actif, false sinon.
function initMetrics(app) {
  // Protection optionnelle : si METRICS_API_KEY est défini, /metrics exige un Bearer token.
  const metricsApiKey = process.env.METRICS_API_KEY ? String(process.env.METRICS_API_KEY) : null

  app.get('/metrics', async (req, res) => {
    if (metricsApiKey) {
      const auth = String(req.headers['authorization'] || '')
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth.trim()
      if (!token || token !== metricsApiKey) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }

    if (client && client.register) {
      try {
        res.setHeader('Content-Type', client.register.contentType)
        res.end(await client.register.metrics())
        return
      } catch (e) {
        // fallback minimal
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('# metrics not enabled\n')
  })

  if (!client) {
    state.enabled = false
    return false
  }
  state.enabled = true

  const register = client.register
  try {
    client.collectDefaultMetrics({ register })

    state.httpDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    })

    state.httpInFlight = new client.Gauge({
      name: 'http_in_flight_requests',
      help: 'In-flight HTTP requests',
    })

    state.httpTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    })

    state.httpErrors = new client.Counter({
      name: 'http_errors_total',
      help: 'Total HTTP error responses',
      labelNames: ['method', 'route', 'status'],
    })

    state.cacheHits = new client.Counter({
      name: 'cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['route'],
    })

    state.cacheMisses = new client.Counter({
      name: 'cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['route'],
    })

    state.cacheHitRatio = new client.Gauge({
      name: 'cache_hit_ratio',
      help: 'Cache hit ratio (hits/(hits+misses))',
      labelNames: ['route'],
    })

    state.pointsReturned = new client.Counter({
      name: 'timeseries_points_returned_total',
      help: 'Total timeseries points returned',
      labelNames: ['route'],
    })

    state.socketConnections = new client.Gauge({
      name: 'socket_connections',
      help: 'Current Socket.IO connections',
    })

    state.alertsTotal = new client.Counter({
      name: 'alerts_total',
      help: 'Total alerts emitted',
      labelNames: ['level', 'metricKey'],
    })

    state.dataFreshness = new client.Gauge({
      name: 'data_freshness_seconds',
      help: 'Age of last point in seconds',
      labelNames: ['deviceId', 'metricKey'],
    })

    state.dataCompleteness = new client.Gauge({
      name: 'data_completeness_ratio',
      help: 'Completeness ratio over the evaluated window',
      labelNames: ['deviceId', 'metricKey'],
    })

    state.dataGaps = new client.Gauge({
      name: 'data_gaps',
      help: 'Number of missing buckets over the evaluated window',
      labelNames: ['deviceId', 'metricKey'],
    })

    state.temp = new client.Gauge({
      name: 'iot_temp_celsius',
      help: 'IoT device temperature in Celsius',
    })

    state.humid = new client.Gauge({
      name: 'iot_humid_percent',
      help: 'IoT device humidity in percent',
    })

    state.U = new client.Gauge({
      name: 'iot_voltage_volts',
      help: 'IoT device voltage in Volts',
    })

    state.I = new client.Gauge({
      name: 'iot_current_amperes',
      help: 'IoT device current in Amperes',
    })

    state.P = new client.Gauge({
      name: 'iot_power_watts',
      help: 'IoT device power in Watts',
    })

    state.E = new client.Gauge({
      name: 'iot_energy_wh',
      help: 'IoT device energy in Watt-hours',
    })

    state.F = new client.Gauge({
      name: 'iot_frequency_hz',
      help: 'IoT device frequency in Hertz',
    })

    state.pf = new client.Gauge({
      name: 'iot_power_factor',
      help: 'IoT device power factor',
    })

    // Middleware global HTTP
    app.use((req, res, next) => {
      // On ne pollue pas les stats avec /metrics lui-même
      if (req.path === '/metrics') return next()

      try { state.httpInFlight.inc() } catch {}

      const start = process.hrtime.bigint()
      res.on('finish', () => {
        try {
          state.httpInFlight.dec()
          const end = process.hrtime.bigint()
          const dur = Number(end - start) / 1e9
          const method = (req.method || 'GET').toUpperCase()
          const route =
            (req.route && req.route.path) ||
            (req.originalUrl && req.originalUrl.split('?')[0]) ||
            'unknown'
          const status = String(res.statusCode || 0)

          state.httpDuration.observe({ method, route, status }, dur)
          state.httpTotal.inc({ method, route, status })
          if (res.statusCode >= 400) {
            state.httpErrors.inc({ method, route, status })
          }
        } catch {}
      })

      next()
    })

    state.enabled = true
    return true
  } catch {
    state.enabled = false
    return false
  }
}

function httpMetricsMiddleware() {
  if (!state.enabled || !client) return (_req, _res, next) => next()
  return (req, res, next) => {
    state.httpInFlight.inc()
    const start = process.hrtime.bigint()
    res.once('finish', () => {
      state.httpInFlight.dec()
      const duration = Number(process.hrtime.bigint() - start) / 1e9
      const route = req.route && req.route.path ? req.route.path : (req.path || 'unknown')
      const labels = { method: req.method, route, status: String(res.statusCode) }
      if (state.httpDuration) state.httpDuration.observe(labels, duration)
      if (state.httpTotal) state.httpTotal.inc(labels)
      if (state.httpErrors && res.statusCode >= 500) state.httpErrors.inc(labels)
    })
    next()
  }
}

function recordCacheHit(route) {
  if (!state.enabled || !client) return
  const r = route || 'unknown'
  try {
    state.cacheHits.inc({ route: r })
    state._hitsCount += 1
    const total = state._hitsCount + state._missesCount
    if (total > 0) {
      state.cacheHitRatio.set({ route: r }, state._hitsCount / total)
    }
  } catch {}
}

function recordCacheMiss(route) {
  if (!state.enabled || !client) return
  const r = route || 'unknown'
  try {
    state.cacheMisses.inc({ route: r })
    state._missesCount += 1
    const total = state._hitsCount + state._missesCount
    if (total > 0) {
      state.cacheHitRatio.set({ route: r }, state._hitsCount / total)
    }
  } catch {}
}

function recordPointsReturned(route, count) {
  if (!state.enabled || !client) return
  const r = route || 'unknown'
  const c = Number(count) || 0
  if (!Number.isFinite(c) || c <= 0) return
  try {
    state.pointsReturned.inc({ route: r }, c)
  } catch {}
}

function incSocketConnections() {
  if (!state.enabled || !client || !state.socketConnections) return
  try { state.socketConnections.inc() } catch {}
}

function decSocketConnections() {
  if (!state.enabled || !client || !state.socketConnections) return
  try { state.socketConnections.dec() } catch {}
}

function recordAlert(payload) {
  if (!state.enabled || !client || !state.alertsTotal) return
  if (!payload) return
  const level = String(payload.level || 'ok')
  const metricKey = String(payload.metricKey || 'unknown')
  try {
    state.alertsTotal.inc({ level, metricKey })
  } catch {}
}

function updateDataQualityFromItems(items) {
  if (!state.enabled || !client) return
  if (!Array.isArray(items)) return
  for (const it of items) {
    const deviceId = String(it.deviceId || 'unknown')
    const metricKey = String(it.metricKey || 'unknown')
    try {
      if (state.dataFreshness && it.freshnessMs != null) {
        const sec = Math.max(0, Number(it.freshnessMs) / 1000)
        if (Number.isFinite(sec)) {
          state.dataFreshness.set({ deviceId, metricKey }, sec)
        }
      }
      if (state.dataCompleteness && it.completeness != null) {
        const ratio = Number(it.completeness)
        if (Number.isFinite(ratio)) {
          state.dataCompleteness.set({ deviceId, metricKey }, ratio)
        }
      }
      if (state.dataGaps && it.gaps != null) {
        const gaps = Number(it.gaps)
        if (Number.isFinite(gaps)) {
          state.dataGaps.set({ deviceId, metricKey }, gaps)
        }
      }
    } catch {}
  }
}

function updateIotMetrics(values) {
  if (!state.enabled || !client) return
  if (!values || typeof values !== 'object') return

  try {
    if (state.temp && values.temp != null) {
      const v = Number(values.temp)
      if (Number.isFinite(v)) state.temp.set(v)
    }
    if (state.humid && values.humid != null) {
      const v = Number(values.humid)
      if (Number.isFinite(v)) state.humid.set(v)
    }
    if (state.U && values.U != null) {
      const v = Number(values.U)
      if (Number.isFinite(v)) state.U.set(v)
    }
    if (state.I && values.I != null) {
      const v = Number(values.I)
      if (Number.isFinite(v)) state.I.set(v)
    }
    if (state.P && values.P != null) {
      const v = Number(values.P)
      if (Number.isFinite(v)) state.P.set(v)
    }
    if (state.E && values.E != null) {
      const v = Number(values.E)
      if (Number.isFinite(v)) state.E.set(v)
    }
    if (state.F && values.F != null) {
      const v = Number(values.F)
      if (Number.isFinite(v)) state.F.set(v)
    }
    if (state.pf && values.pf != null) {
      const v = Number(values.pf)
      if (Number.isFinite(v)) state.pf.set(v)
    }
  } catch {}
}

module.exports = {
  initMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordPointsReturned,
  httpMetricsMiddleware,
  incSocketConnections,
  decSocketConnections,
  recordAlert,
  updateDataQualityFromItems,
  updateIotMetrics,
}
