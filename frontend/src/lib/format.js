// Formatting helpers for units, values, and axis domains

export function unitForMetric(metric) {
  switch (metric) {
    case 'U': return 'V'
    case 'I': return 'A'
    case 'P': return 'kW' // display in kW
    case 'E': return 'kWh' // display in kWh
    case 'F': return 'Hz'
    case 'pf': return ''
    case 'temp': return '°C'
    case 'humid': return '%'
    default: return ''
  }
}

export function toDisplay(metric, value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return ''
  switch (metric) {
    case 'P': return v / 1000 // W -> kW
    case 'E': return v / 1000 // Wh -> kWh
    default: return v
  }
}

export function formatValue(metric, value) {
  const val = toDisplay(metric, value)
  if (!Number.isFinite(val)) return ''
  const u = unitForMetric(metric)
  const s = (metric === 'U') ? val.toFixed(1)
          : (metric === 'I') ? val.toFixed(1)
          : (metric === 'P') ? val.toFixed(1)
          : (metric === 'E') ? val.toFixed(1)
          : (metric === 'F') ? val.toFixed(2)
          : (metric === 'pf') ? val.toFixed(2)
          : (metric === 'temp') ? val.toFixed(1)
          : (metric === 'humid') ? Math.round(val).toString()
          : String(val)
  return u ? `${s} ${u}` : s
}

export function yTickFormatterFor(metric) {
  return (raw) => {
    const val = toDisplay(metric, raw)
    if (!Number.isFinite(val)) return ''
    if (metric === 'U') return val.toFixed(1)
    if (metric === 'I') return val.toFixed(1)
    if (metric === 'P') return val.toFixed(1)
    if (metric === 'E') return val.toFixed(1)
    if (metric === 'F') return val.toFixed(2)
    if (metric === 'pf') return val.toFixed(2)
    if (metric === 'temp') return val.toFixed(1)
    if (metric === 'humid') return String(Math.round(val))
    return String(val)
  }
}

export function yDomainFor(metric, data) {
  try {
    const vals = Array.isArray(data) ? data.map(d => Number(d.value ?? d[metric])).filter(Number.isFinite) : []
    if (!vals.length) return ['auto', 'auto']
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (p) => ({
      min: p - Math.abs(p) * 0.03,
      max: p + Math.abs(p) * 0.03,
    })
    switch (metric) {
      case 'U': {
        const m = pad(min).min; const M = pad(max).max
        const lo = Math.max(200, Math.min(210, m))
        const hi = Math.min(260, Math.max(250, M))
        return [lo, hi]
      }
      case 'I': {
        const M = pad(max).max
        return [0, Math.max(1, M)]
      }
      case 'P': {
        // Keep raw domain; tick formatter converts to kW
        const m = Math.min(min, 0)
        const M = pad(max).max
        return [m, Math.max(1, M)]
      }
      case 'E': {
        const m = pad(min).min; const M = pad(max).max
        return [Math.max(0, m), Math.max(m + 1, M)]
      }
      case 'F': return [49, 51.5]
      case 'pf': return [0.7, 1.0]
      case 'temp': {
        return [min - 2, max + 2]
      }
      case 'humid': return [0, 100]
      default: return ['auto', 'auto']
    }
  } catch { return ['auto', 'auto'] }
}

export function timeTickFormatter(fromMs, toMs) {
  const span = Math.max(0, Number(toMs) - Number(fromMs))
  const day = 24 * 60 * 60 * 1000
  return (ts) => {
    try {
      const d = new Date(Number(ts))
      if (span <= day) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      if (span <= 14 * day) return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit' })
      return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
    } catch { return '' }
  }
}

export function targetPointsForSpan(spanMs) {
  const day = 24 * 60 * 60 * 1000
  if (spanMs <= day) return 240
  if (spanMs <= 7 * day) return 480
  if (spanMs <= 31 * day) return 720
  return 1200
}

export function bucketForSpan(spanMs, minBucketMs = 60 * 1000) {
  const target = targetPointsForSpan(spanMs)
  const raw = Math.max(minBucketMs, Math.floor(spanMs / Math.max(1, target)))
  // round to minute/hour
  if (raw < 60 * 60 * 1000) return Math.floor(raw / (60 * 1000)) * (60 * 1000)
  return Math.floor(raw / (60 * 60 * 1000)) * (60 * 60 * 1000)
}
