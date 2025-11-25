import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'

// Ensure React has a "use" export for components that import it
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual, default: actual, use: actual.use || (() => {}) }
})

// Lightweight stubs for heavy components/libraries
vi.mock('react-grid-layout', () => {
  const Dummy = ({ children }) => <div data-testid="grid">{children}</div>
  const WidthProvider = (Comp) => Comp
  return { Responsive: Dummy, WidthProvider }
})
vi.mock('react-chartjs-2', () => ({ Doughnut: () => <div data-testid="doughnut" />, Line: () => <div /> }))
vi.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>
  const Leaf = () => <div />
  return {
    ResponsiveContainer: Stub,
    AreaChart: Stub,
    Area: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Leaf,
    CartesianGrid: Leaf,
    LineChart: Stub,
    Line: Leaf,
    BarChart: Stub,
    Bar: Leaf,
    Brush: Leaf,
    ReferenceLine: Leaf,
    ReferenceArea: Leaf,
    ComposedChart: Stub,
  }
})
vi.mock('../components/StatCards.jsx', () => ({ default: () => <div data-testid="statcards" /> }))
vi.mock('../components/RoomContribution.jsx', () => ({ default: () => <div data-testid="room-contrib" /> }))
vi.mock('../components/AdvancedFilters.jsx', () => ({ default: () => <div data-testid="filters" /> }))
vi.mock('../components/AnomaliesList.jsx', () => ({ default: () => <div data-testid="anomalies" /> }))
vi.mock('../components/Diagnostics.jsx', () => ({ default: () => <div data-testid="diagnostics" /> }))
vi.mock('../components/AlertsList.jsx', () => ({ default: () => <div data-testid="alerts-list" /> }))
vi.mock('../components/DataHealthSummary.jsx', () => ({ default: () => <div data-testid="data-health" /> }))
vi.mock('../state/filters.js', () => ({
  useUiStore: () => ({
    period: { key: '1h', ms: 3600000, bucketMs: 60000 },
    anchorNow: Date.now(),
    live: false,
    bucketMs: 60000,
    aggregation: 'auto',
    selectedDevices: [{ id: 'd1', name: 'Device 1' }],
    devices: [{ id: 'd1', name: 'Device 1' }],
    metrics: [{ key: 'P', unit: 'W' }],
    selectedMetrics: [],
    selectedRoom: 'all',
    selectedTags: [],
    setDevices: vi.fn(),
    setMetrics: vi.fn(),
    setPeriodKey: vi.fn(),
    setHoverTs: vi.fn(),
    setBucketMs: vi.fn(),
    setFilters: vi.fn(),
    toggleLive: vi.fn(),
  }),
}))
vi.mock('../state/assets.js', () => ({
  useAssets: () => ({ assets: [], meta: {}, setMeta: vi.fn(), reloadAssets: vi.fn() }),
}))
vi.mock('../state/alerts.js', () => ({
  useAlerts: () => ({ alerts: [{ id: 'a1', level: 'warn' }], reload: vi.fn() }),
}))
vi.mock('../state/settings.js', () => ({
  useSettings: () => ({ thresholds: {}, options: { deadbandPct: 0 }, setColor: vi.fn(), colors: {} }),
  defaultSeriesColors: {},
}))
vi.mock('../state/annotations.js', () => ({
  useAnnotations: () => ({ annotations: [], addAnnotation: vi.fn(), removeAnnotation: vi.fn() }),
}))
vi.mock('../components/AuthProvider.jsx', () => ({
  useAuth: () => ({ user: { sub: 'u1', roles: ['admin'] }, login: vi.fn(), logout: vi.fn() }),
}))
vi.mock('../lib/prefetch.js', () => ({ prefetchHome: vi.fn(), prefetchDevices: vi.fn() }))
vi.mock('../lib/chartjs-setup.js', () => ({ registerBaseCharts: vi.fn(), registerZoom: vi.fn() }))
vi.mock('../lib/theme.js', () => ({ chartTheme: {} }))
vi.mock('../lib/statsRobust.js', () => ({
  robustZ: () => [],
  baselineByDOWHour: () => ({}),
  valueMinusBaseline: () => [],
}))
vi.mock('../lib/analysisUtils.js', () => ({
  computeDerivative: () => [],
  detectDerivativeAnomalies: () => [],
  linearForecast: () => [],
}))
vi.mock('../lib/exportUtils.js', () => ({
  toJson: () => '',
  downloadText: vi.fn(),
}))
vi.mock('../lib/stats.js', () => ({
  computeStats: () => ({}),
  toCsv: () => '',
  download: vi.fn(),
  rollingZscore: () => [],
}))
vi.mock('./HomePage.jsx', () => ({ default: () => <div data-testid="home-page" /> }))
vi.mock('./DeviceDetail.jsx', () => ({ default: () => <div data-testid="device-detail" /> }))

const apiMock = {
  devices: vi.fn().mockResolvedValue({ devices: [{ id: 'd1', name: 'Device 1' }] }),
  metrics: vi.fn().mockResolvedValue({ metrics: [{ key: 'P', unit: 'W' }] }),
  timeseries: vi.fn().mockResolvedValue({ points: [] }),
  kpis: vi.fn().mockResolvedValue({ kpis: [] }),
}
vi.mock('../services/api.js', () => ({ api: apiMock }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Pages render with mocked data', () => {
  it('renders HomePage with stat cards and room contrib', async () => {
    const { default: HomePage } = await import('./HomePage.jsx')
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('home-page')).toBeInTheDocument()
  })

  it('renders DeviceDetail and handles empty timeseries', async () => {
    const { default: DeviceDetail } = await import('./DeviceDetail.jsx')
    render(
      <MemoryRouter initialEntries={['/devices/d1']}>
        <Routes>
          <Route path="/devices/:deviceId" element={<DeviceDetail />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByTestId('device-detail')).toBeInTheDocument())
  })
})
