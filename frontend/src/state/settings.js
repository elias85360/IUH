import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const defaultThresholds = {
  U: { warn: 240, crit: 250 },
  I: { warn: 15, crit: 20 },
  P: { warn: 2000, crit: 3000 },
  E: { warn: null, crit: null },
  F: { warn: 51.0, crit: 52.0 },
  pf: { warn: 0.8, crit: 0.7, direction: 'below' },
  temp: { warn: 28, crit: 32 },
  humid: { warn: 70, crit: 85 },
}
 
export const useSettings = create(persist((set, get) => ({
  // thresholds[deviceId][metric] = { warn, crit, direction }
  thresholds: {},
  getThreshold(deviceId, metric) {
    const dev = get().thresholds[deviceId] || {}
    return dev[metric] || defaultThresholds[metric] || { warn: null, crit: null }
  },
  setThreshold(deviceId, metric, patch) {
    set((state) => {
      const next = { ...state.thresholds }
      const dev = { ...(next[deviceId] || {}) }
      dev[metric] = { ...(dev[metric] || defaultThresholds[metric] || {}), ...patch }
      next[deviceId] = dev
      return { thresholds: next }
    })
  },
  resetDevice(deviceId) {
    set((state) => {
      const next = { ...state.thresholds }
      delete next[deviceId]
      return { thresholds: next }
    })
  },
  options: {
    smoothing: false,
    smoothingMode: 'SMA', // 'SMA' | 'EMA'
    smoothingWindow: 5,
    bucketMs: undefined,
    highlightAnomalies: true,
    anomalyZ: 3,
    showBaseline: true,
    showForecast: false,
    yScale: 'linear', // 'linear' | 'log'
    theme: 'light', // 'dark' | 'light' (default: light across all pages)
    lang: 'fr', // 'fr' | 'en'
  },
  setOptions(patch) { set((s)=>({ options: { ...s.options, ...patch } })) },
}), { name: 'dashboard-settings' }))
