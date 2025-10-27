import { create } from 'zustand'

// Stores recent points per series for live updates
// Key: `${deviceId}::${metricKey}` => [{ ts, value }]
export const useDataCache = create((set, get) => ({
  series: new Map(),
  retentionMs: 8 * 60 * 60 * 1000, // keep last 8h in memory by default
  upsertPoint(deviceId, metricKey, ts, value) {
    const key = `${deviceId}::${metricKey}`
    const map = new Map(get().series)
    const arr = map.get(key) || []
    arr.push({ ts, value: Number(value) })
    const cutoff = Date.now() - get().retentionMs
    while (arr.length && arr[0].ts < cutoff) arr.shift()
    map.set(key, arr)
    set({ series: map })
  },
  getSeries(deviceId, metricKey, from, to) {
    const key = `${deviceId}::${metricKey}`
    const arr = get().series.get(key) || []
    return arr.filter(p => (!from || p.ts >= from) && (!to || p.ts <= to))
  },
  clear() { set({ series: new Map() }) },
}))

 