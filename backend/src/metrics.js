// Prometheus metrics for the backend API.
// Uses prom-client if available. Gracefully no-ops if dependency or env not present.

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
  _hitsCount: 0,
  _missesCount: 0,
}

function initMetrics(app) {
  // Always expose /metrics, even if prom-client is missing or errors
  app.get('/metrics', async (_req, res) => {
    if (client && client.register) {
      try {
        res.setHeader('Content-Type', client.register.contentType)
        res.end(await client.register.metrics())
        return
      } catch (e) {
        // fall through to minimal body
      }
    }
    const body = [
      '# HELP app_info Static application info',
      '# TYPE app_info gauge',
      'app_info{service="iot-backend"} 1'
    ].join('\n') + '\n'
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.end(body)
  })
  if (!client) return false
  const register = client.register
  try {
    client.collectDefaultMetrics({ register })
    state.httpDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      // Tuned buckets: 50ms, 100ms, 200ms, 500ms, 1s, 2s, 5s
      buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
    })
    state.httpInFlight = new client.Gauge({ name: 'http_in_flight_requests', help: 'In-flight HTTP requests' })
    state.httpTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] })
    state.httpErrors = new client.Counter({ name: 'http_errors_total', help: 'Total HTTP error responses', labelNames: ['method', 'route', 'status'] })
    state.cacheHits = new client.Counter({ name: 'cache_hits_total', help: 'Total cache hits', labelNames: ['route'] })
    state.cacheMisses = new client.Counter({ name: 'cache_misses_total', help: 'Total cache misses', labelNames: ['route'] })
    state.cacheHitRatio = new client.Gauge({ name: 'cache_hit_ratio', help: 'Cache hit ratio (hits/(hits+misses))', labelNames: ['route'] })
    state.pointsReturned = new client.Counter({ name: 'timeseries_points_returned_total', help: 'Total timeseries points returned', labelNames: ['route'] })
    state.socketConnections = new client.Gauge({ name: 'socket_connections', help: 'Current Socket.IO connections' })
    state.alertsTotal = new client.Counter({ name: 'alerts_total', help: 'Total alerts emitted', labelNames: ['level','metricKey'] })
    state.dataFreshness = new client.Gauge({ name: 'data_freshness_seconds', help: 'Age of last point in seconds', labelNames: ['deviceId','metricKey'] })
    state.dataCompleteness = new client.Gauge({ name: 'data_completeness_ratio', help: 'Completeness ratio over the evaluated window', labelNames: ['deviceId','metricKey'] })
    state.dataGaps = new client.Gauge({ name: 'data_gaps', help: 'Number of missing buckets over the evaluated window', labelNames: ['deviceId','metricKey'] })
    state.temp = new client.Gauge({ name: 'iot_temp_celsius', help: 'IoT device temperature in Celsius' })
    state.humid = new client.Gauge({ name: 'iot_humid_percent', help: 'IoT device humidity in percent' })
    state.U = new client.Gauge({ name: 'iot_voltage_volts', help: 'IoT device voltage in Volts' })
    state.I = new client.Gauge({ name: 'iot_current_amperes', help: 'IoT device current in Amperes' })
    state.P = new client.Gauge({ name: 'iot_power_watts', help: 'IoT device power in Watts' })
    state.E = new client.Gauge({ name: 'iot_energy_wh', help: 'IoT device energy in Watt-hours' })
    state.F = new client.Gauge({ name: 'iot_frequency_hz', help: 'IoT device frequency in Hertz' })
    state.pf = new client.Gauge({ name: 'iot_power_factor', help: 'IoT device power factor' })
    // Instrumentation middleware
    app.use((req, res, next) => {
      try { state.httpInFlight.inc() } catch {}
      const start = process.hrtime.bigint()
      res.on('finish', () => {
        try {
          state.httpInFlight.dec()
          const end = process.hrtime.bigint()
          const dur = Number(end - start) / 1e9
          const method = (req.method || 'GET').toUpperCase()
          const route = (req.route && req.route.path) || (req.originalUrl && req.originalUrl.split('?')[0]) || 'unknown'
          const status = String(res.statusCode || 0)
          state.httpDuration.observe({ method, route, status }, dur)
          state.httpTotal.inc({ method, route, status })
          if (res.statusCode >= 400) state.httpErrors.inc({ method, route, status })
        } catch {}
      })
      next()
    })

    state.enabled = true
    return true
  } catch {
    return false
  }
}

function recordCacheHit(route) {
  if (client && state.cacheHits) try {
    state.cacheHits.inc({ route })
    state._hitsCount++
    const tot = state._hitsCount + state._missesCount
    if (tot > 0 && state.cacheHitRatio) state.cacheHitRatio.set({ route }, state._hitsCount / tot)
  } catch {}
}
function recordCacheMiss(route) {
  if (client && state.cacheMisses) try {
    state.cacheMisses.inc({ route })
    state._missesCount++
    const tot = state._hitsCount + state._missesCount
    if (tot > 0 && state.cacheHitRatio) state.cacheHitRatio.set({ route }, state._hitsCount / tot)
  } catch {}
}

function recordPointsReturned(route, count) {
  if (client && state.pointsReturned && Number.isFinite(Number(count))) try { state.pointsReturned.inc({ route }, Number(count)) } catch {}
}

function incSocketConnections() {
  if (client && state.socketConnections) try { state.socketConnections.inc() } catch {}
}

function decSocketConnections() {
  if (client && state.socketConnections) try { state.socketConnections.dec() } catch {}
}

function recordAlert(level, metricKey) {
  if (client && state.alertsTotal) try { state.alertsTotal.inc({ level: String(level || 'unknown'), metricKey: String(metricKey || 'unknown') }) } catch {}
}

function updateDataQualityFromItems(items) {
  if (!client || !Array.isArray(items)) return
  try {
    for (const it of items) {
      const labels = { deviceId: String(it.deviceId || ''), metricKey: String(it.metricKey || '') }
      if (state.dataFreshness && it.freshnessMs != null) state.dataFreshness.set(labels, Number(it.freshnessMs) / 1000)
      if (state.dataCompleteness && it.completeness != null) state.dataCompleteness.set(labels, Number(it.completeness))
      if (state.dataGaps && it.gaps != null) state.dataGaps.set(labels, Number(it.gaps))
    }
  } catch {}
}

function updateIotMetrics(data) {
  if (!client || !state.enabled) return
  try {
    if (data.temp != null) state.temp.set(data.temp)
    if (data.humid != null) state.humid.set(data.humid)
    if (data.U != null) state.U.set(data.U)
    if (data.I != null) state.I.set(data.I)
    if (data.P != null) state.P.set(data.P)
    if (data.E != null) state.E.set(data.E)
    if (data.F != null) state.F.set(data.F)
    if (data.pf != null) state.pf.set(data.pf)
  } catch (e) { /* ignore */ }
}


module.exports = {
  initMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordPointsReturned,
  incSocketConnections,
  decSocketConnections,
  recordAlert,
  updateDataQualityFromItems,
  updateIotMetrics,
}
