// Edit this function to map your legacy project payloads to the internal point format
// Expected output: array of { deviceId, metricKey, ts, value }

function defaultMap(payload) {
  // Example generic forms supported out-of-the-box:
  // 1) { deviceId, metric, ts, value }
  if (payload && payload.deviceId && payload.metric && payload.ts != null && payload.value != null) {
    return [{ deviceId: payload.deviceId, metricKey: payload.metric, ts: Number(payload.ts), value: Number(payload.value) }]
  }
  // 2) { deviceId, ts, values: { U:123, I:5, ... } }
  if (payload && payload.deviceId && payload.ts != null && payload.values && typeof payload.values === 'object') {
    const out = []
    for (const [metricKey, v] of Object.entries(payload.values)) {
      out.push({ deviceId: payload.deviceId, metricKey, ts: Number(payload.ts), value: Number(v) })
    }
    return out 
  }
  // 3) [ { deviceId, metricKey, ts, value }, ... ] pass-through
  if (Array.isArray(payload) && payload.length && payload[0].deviceId) return payload
  return []
}

module.exports = { mapRemoteToPoints: defaultMap }

