import { api } from '../services/api.js'

// Returns [{ ts, kwh }] summed across devices for the given bucketMs.
export async function fetchEnergyBuckets(devices, from, to, bucketMs) {
  const buckets = new Map()
  let totalWh = 0
  // Try E (Wh) first
  for (const d of devices) {
    const r = await api.timeseries(d.id, 'E', { from, to, bucketMs })
    for (const p of (r.points || [])) {
      const ts = p.ts 
      const wh = Number(p.sum || p.value || 0)
      totalWh += wh
      const m = buckets.get(ts) || { ts, kwh: 0 }
      m.kwh += wh / 1000
      buckets.set(ts, m)
    }
  }
  // If everything is zero, fall back to integrating P (W)
  if (Array.from(buckets.values()).every(b => b.kwh === 0)) {
    buckets.clear()
    const hours = bucketMs / 3600000
    for (const d of devices) {
      const r = await api.timeseries(d.id, 'P', { from, to, bucketMs })
      for (const p of (r.points || [])) {
        const ts = p.ts
        const avgW = Number(p.value || 0)
        const kwh = (avgW * hours) / 1000
        const m = buckets.get(ts) || { ts, kwh: 0 }
        m.kwh += kwh
        buckets.set(ts, m)
      }
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts)
}

// Sum kWh over range; uses fetchEnergyBuckets under the hood.
export async function sumEnergyKwh(devices, from, to, bucketMs) {
  const rows = await fetchEnergyBuckets(devices, from, to, bucketMs)
  return rows.reduce((s, r) => s + r.kwh, 0)
}

