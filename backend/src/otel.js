// Lightweight OpenTelemetry usage (optional). If @opentelemetry/api is not
// available, exports no-op helpers.
let api = null
try { api = require('@opentelemetry/api') } catch { api = null }

function withSpan(name, fn) {
  if (!api) return fn()
  const tracer = api.trace.getTracer('iot-backend')
  return tracer.startActiveSpan(name, async (span) => {
    try { return await fn() } catch (e) { span.recordException(e); throw e } finally { span.end() }
  })
}

function spanAddEvent(name, attrs) { try { if (api) api.trace.getActiveSpan()?.addEvent(name, attrs) } catch {} }

module.exports = { withSpan, spanAddEvent }

