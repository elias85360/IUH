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
    /* state.temp = new client.Gauge({ name: 'temp', help: 'Temperature in Celsius' })
    state.humid = new client.Gauge({ name: 'humid', help: 'Humidity in %' })
    state.U = new client.Gauge({ name: 'U', help: 'Voltage in Volts' })
    state.I = new client.Gauge({ name: 'I', help: 'Current in Amperes' })
    state.P = new client.Gauge({ name: 'P', help: 'Power in Watts' })
    state.E = new client.Gauge({ name: 'E', help: 'Energy in Wh' })
    state.F = new client.Gauge({ name: 'F', help: 'Frequency in Hz' })
    state.pf = new client.Gauge({ name: 'pf', help: 'Power Factor' }) */
    state.httpDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
    })
    state.httpInFlight = new client.Gauge({ name: 'http_in_flight_requests', help: 'In-flight HTTP requests' })
    state.httpTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'] })
    state.httpErrors = new client.Counter({ name: 'http_errors_total', help: 'Total HTTP error responses', labelNames: ['method', 'route', 'status'] })
    state.cacheHits = new client.Counter({ name: 'cache_hits_total', help: 'Total cache hits', labelNames: ['route'] })
    state.cacheMisses = new client.Counter({ name: 'cache_misses_total', help: 'Total cache misses', labelNames: ['route'] })
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
  if (client && state.cacheHits) try { state.cacheHits.inc({ route }) } catch {}
}
function recordCacheMiss(route) {
  if (client && state.cacheMisses) try { state.cacheMisses.inc({ route }) } catch {}
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
  updateIotMetrics 
}
