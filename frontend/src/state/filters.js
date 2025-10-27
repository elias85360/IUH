import { create } from 'zustand'

// Available time windows for the dashboard.  In addition to the
// original 1 h/24 h/7 jours selections, extended periods such as
// 30 jours, 6 mois and 1 an have been added to allow
// longer‑term analyses.  The `ms` field expresses the window
// length in milliseconds.
export const PERIODS = [
  { key: '1h', label: 'Dernière 1 h', ms: 60 * 60 * 1000 },
  { key: '24h', label: 'Dernières 24 h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 jours', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '6mo', label: '6 mois', ms: 182 * 24 * 60 * 60 * 1000 }, // approx 6 months
  { key: '1y', label: '1 an', ms: 365 * 24 * 60 * 60 * 1000 },
]
 
export const useUiStore = create((set, get) => ({
  loaded: false,
  loading: false,
  period: PERIODS[0],
  anchorNow: Date.now(),
  selectedTypes: [],
  selectedMetrics: [],
  selectedRoom: 'all',
  selectedTags: [],
  selectedDevices: [],
  searchDevice: '',
  // Live + viz options
  live: true,
  bucketMs: undefined, // auto
  smoothing: false,
  highlightAnomalies: true,
  chartType: 'line', // 'line' | 'area' | 'bar' | 'scatter'
  page: 1,
  pageSize: 8,
  // Aggregation scale key.  Determines a predefined bucket
  // duration when set via the filters.  Possible values are
  // 'auto' (null/undefined), '1min', '10min', 'hour', 'day', 'week', 'month'.
  aggregation: 'auto',
  // Value range filters used to discard points outside of the
  // specified interval.  Both bounds are optional.  They are
  // interpreted as numbers when provided and ignored when empty.
  valueMin: '',
  valueMax: '',
  devices: [],
  metrics: [],
  setDevices: (devices) => set({ devices }),
  setMetrics: (metrics) => set({ metrics }),
  setPeriodKey: (key) => {
    const p = PERIODS.find(p => p.key === key) || PERIODS[0]
    set({ period: p, anchorNow: Date.now() })
  },
  refreshNow: () => set({ anchorNow: Date.now() }),
  setLoaded: (v) => set({ loaded: v }),
  setLoading: (v) => set({ loading: v }),
  setFilters: (partial) => set(partial),
  toggleLive: () => set((s)=>({ live: !s.live })),
  setBucketMs: (ms) => set({ bucketMs: ms || undefined }),
  toggleSmoothing: () => set((s)=>({ smoothing: !s.smoothing })),
  toggleHighlight: () => set((s)=>({ highlightAnomalies: !s.highlightAnomalies })),
  setChartType: (t) => set({ chartType: t }),
  setSearchDevice: (q) => set({ searchDevice: q }),
  setPage: (p) => set({ page: Math.max(1, p) }),
  setPageSize: (n) => set({ pageSize: Math.max(1, n), page: 1 }),
  setAggregation: (agg) => set({ aggregation: agg || 'auto' }),
  setValueMin: (v) => set({ valueMin: v }),
  setValueMax: (v) => set({ valueMax: v }),
  // Cross-highlight: shared hovered timestamp across charts
  hoverTs: null,
  setHoverTs: (ts) => set({ hoverTs: ts || null }),
  clearHover: () => set({ hoverTs: null }),
}))
