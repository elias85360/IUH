import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { chartTheme } from '../lib/theme.js'

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

export const defaultSeriesColors = {
  U: chartTheme.series.purple,
  I: chartTheme.series.cyan,
  P: chartTheme.series.secondary,
  E: chartTheme.series.primary,
  pf: chartTheme.series.warning,
  F: chartTheme.series.blue,
  temp: chartTheme.series.danger,
  humid: chartTheme.series.cyan,
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
  seriesColors: {},
  getSeriesColor(metric) {
    const color = get().seriesColors[metric]
    return color || defaultSeriesColors[metric] || chartTheme.series.primary
  },
  setSeriesColor(metric, color) {
    set((state) => {
      const next = { ...state.seriesColors }
      if (!color || color === defaultSeriesColors[metric]) delete next[metric]
      else next[metric] = color
      return { seriesColors: next }
    })
  },
  resetSeriesColor(metric) {
    set((state) => {
      const next = { ...state.seriesColors }
      delete next[metric]
      return { seriesColors: next }
    })
  },
  resetAllSeriesColors() {
    set(() => ({ seriesColors: {} }))
  },
  options: {
    smoothing: false,
    smoothingMode: 'SMA', // 'SMA' | 'EMA'
    smoothingWindow: 5,
    bucketMs: undefined,
    anomalyZ: 3,
    showBaseline: true,
    showForecast: false,
    yScale: 'linear', // 'linear' | 'log'
    theme: 'light', // 'dark' | 'light' (default: light across all pages)
    lang: 'fr', // 'fr' | 'en'
  },
  setOptions(patch) { set((s)=>({ options: { ...s.options, ...patch } })) },
}), { name: 'dashboard-settings' }))



/* frontend/src/components/AdvancedFilters.jsx
frontend/src/components/AvgTemperaturePanel.jsx
frontend/src/components/CalendarHeatmap.jsx
frontend/src/components/CarbonFootprintCard.jsx
frontend/src/components/ComparePanel.jsx
frontend/src/components/ContributionWaterfall.jsx
frontend/src/components/DailyConsumption.jsx
frontend/src/components/DeviceCard.jsx
frontend/src/components/DeviceOptions.jsx
frontend/src/components/Diagnostics.jsx
frontend/src/components/EnergyByHour.jsx
frontend/src/components/FiltersBar.jsx
frontend/src/components/HomeAnomalies.jsx
frontend/src/components/HomeGridLayout.jsx
frontend/src/components/KPIBar.jsx
frontend/src/components/NavBar.jsx
frontend/src/components/OverviewSparklines.jsx
frontend/src/components/Pagination.jsx
frontend/src/components/PeriodTabs.jsx
frontend/src/components/PFHistogram.jsx
frontend/src/components/RoomSelector.jsx
frontend/src/components/TimeSlider.jsx
frontend/src/components/TopBottom.jsx (uniquement mentionné dans un bloc commenté)
frontend/src/components/UPowerScatter.jsx
frontend/src/components/UsageByDays.jsx
frontend/src/components/UsageByDevice.jsx
Ainsi que les utilitaires qui ne sont importés nulle part :


frontend/src/lib/axis.js
frontend/src/lib/metricsRegistry.js
frontend/src/lib/regression.js
frontend/src/lib/time.js */
