import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual, default: actual, use: actual.use || (() => {}) }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: 'dev-1' }),
    useSearchParams: () => [new URLSearchParams()],
  }
})

vi.mock('react-chartjs-2', () => ({
  Doughnut: () => <div data-testid="chartjs-donut" />,
  Line: () => <div data-testid="chartjs-line" />,
}))

vi.mock('recharts', () => {
  const Stub = ({ onClick, onMouseMove, onMouseLeave, onChange }) => (
    <div
      data-testid="recharts-stub"
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onChange={onChange}
    />
  )
  const Leaf = () => <div data-testid="recharts-leaf" />
  return {
    ResponsiveContainer: Stub,
    LineChart: Stub,
    Line: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    CartesianGrid: Leaf,
    Tooltip: Leaf,
    ReferenceLine: Leaf,
    ReferenceArea: Leaf,
    BarChart: Stub,
    Bar: Leaf,
    Brush: Leaf,
    AreaChart: Stub,
    Area: Leaf,
    ComposedChart: Stub,
  }
})

vi.mock('../lib/chartjs-setup.js', () => ({ registerBaseCharts: vi.fn(), registerZoom: vi.fn() }))
vi.mock('../lib/theme.js', () => ({
  chartTheme: {
    series: {
      primary: '#111',
      secondary: '#222',
      warning: '#f59e0b',
      danger: '#ef4444',
      purple: '#a855f7',
      cyan: '#06b6d4',
      blue: '#2563eb',
      neutral: '#64748b',
      gray: '#94a3b8',
    },
    grid: '#e5e7eb',
    axis: '#0f172a',
    brush: '#2563eb',
  },
}))
vi.mock('../lib/format.js', () => ({
  yDomainFor: vi.fn(() => [0, 300]),
  yTickFormatterFor: vi.fn(() => (v) => String(v)),
  timeTickFormatter: vi.fn(() => (v) => String(v)),
  unitForMetric: vi.fn(() => 'u'),
  formatValue: vi.fn((_k, v) => String(v)),
  toDisplay: vi.fn((_k, v) => Number(v)),
  bucketForSpan: vi.fn(() => 60000),
}))
vi.mock('../lib/stats.js', () => ({
  computeStats: (arr = []) => {
    const last = arr.at(-1)?.value ?? null
    return { count: arr.length, min: last, max: last, avg: last, last }
  },
  toCsv: () => 'csv',
  download: vi.fn(),
}))
vi.mock('../lib/exportUtils.js', () => ({ toJson: () => '[]', downloadText: vi.fn() }))
vi.mock('../lib/statsRobust.js', () => ({
  robustZ: (arr = []) => arr.map(() => ({ z: 0 })),
  baselineByDOWHour: () => Array.from({ length: 7 }, () => Array(24).fill(1)),
  valueMinusBaseline: (arr = []) => arr.map((p) => ({ delta: p.value ?? 0 })),
}))
vi.mock('../lib/analysisUtils.js', () => ({
  computeDerivative: () => [],
  detectDerivativeAnomalies: () => [],
  linearForecast: () => [],
}))

const sharedMocks = vi.hoisted(() => {
  const pushAlert = vi.fn()
  const setSeriesColor = vi.fn()
  const resetSeriesColor = vi.fn()
  const getThreshold = vi.fn((_, metric) => {
    if (metric === 'P') return { warn: 80, crit: 100 }
    if (metric === 'pf') return { warn: 0.8, crit: 0.7, direction: 'below' }
    if (metric === 'temp') return { warn: 25, crit: 30 }
    if (metric === 'humid') return { warn: 60, crit: 80 }
    return { warn: 10, crit: 200 }
  })
  const settingsOptions = {
    smoothing: false,
    smoothingMode: 'SMA',
    smoothingWindow: 5,
    bucketMs: 60000,
    anomalyZ: 3,
    showBaseline: false,
    showForecast: false,
    yScale: 'linear',
    theme: 'light',
    adaptiveWarnPct: 5,
    adaptiveCritPct: 10,
    adaptiveMethod: 'mean',
  }
  const uiStore = {
    period: { key: '1h', ms: 3600000 },
    anchorNow: 1_700_000_000_000,
    valueMin: '',
    valueMax: '',
    hoverTs: null,
    setHoverTs: vi.fn(),
    clearHover: vi.fn(),
    live: false,
    toggleLive: vi.fn(),
    options: settingsOptions,
  }
  const assets = { meta: { 'dev-1': { name: 'Meta Device', room: 'R1' } } }
  const addAnnotation = vi.fn()
  const removeAnnotation = vi.fn()
  const annotations = {
    byDevice: {
      'dev-1': [{ id: 'a1', ts: 1_700_000_000_000, label: 'Existing note' }],
    },
    add: addAnnotation,
    remove: removeAnnotation,
  }
  const authHasRole = vi.fn(() => true)
  const timeseries = vi.fn(async (_id, metricKey) => {
    const base = uiStore.anchorNow
    const val = { P: 120, U: 230, I: 5, F: 50, pf: 0.6, temp: 32, humid: 82, E: 10 }[metricKey] ?? 1
    return { points: [{ ts: base - 1000, value: val }] }
  })
  const thresholdsEffective = vi.fn(async () => ({
    thresholds: {
      P: { warn: 80, crit: 100 },
      U: { warn: 220, crit: 260 },
      I: { warn: 5, crit: 10 },
      F: { warn: 45, crit: 55 },
      pf: { warn: 0.8, crit: 0.7, direction: 'below' },
      temp: { warn: 25, crit: 30 },
      humid: { warn: 60, crit: 80 },
    },
  }))
  const quality = vi.fn(async () => ({
    items: [
      { deviceId: 'dev-1', metricKey: 'P', presentBuckets: [uiStore.anchorNow - 60000], bucketsExpected: 2 },
    ],
  }))
  const exportPdf = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['pdf']) }))
  const notify = vi.fn(async () => ({}))
  return {
    pushAlert,
    setSeriesColor,
    resetSeriesColor,
    getThreshold,
    settingsOptions,
    uiStore,
    assets,
    addAnnotation,
    removeAnnotation,
    annotations,
    authHasRole,
    timeseries,
    thresholdsEffective,
    quality,
    exportPdf,
    notify,
  }
})

vi.mock('../state/alerts.js', () => ({ useAlerts: () => ({ push: sharedMocks.pushAlert }) }))
vi.mock('../state/settings.js', () => ({
  useSettings: () => ({
    options: sharedMocks.settingsOptions,
    getThreshold: sharedMocks.getThreshold,
    seriesColors: {},
    setSeriesColor: sharedMocks.setSeriesColor,
    resetSeriesColor: sharedMocks.resetSeriesColor,
  }),
  defaultSeriesColors: {},
}))
vi.mock('../state/filters.js', () => ({ useUiStore: () => sharedMocks.uiStore }))
vi.mock('../state/assets.js', () => ({ useAssets: () => sharedMocks.assets }))
vi.mock('../state/annotations.js', () => ({ useAnnotations: () => sharedMocks.annotations }))
vi.mock('../components/AuthProvider.jsx', () => ({ useAuth: () => ({ hasRole: sharedMocks.authHasRole }) }))
vi.mock('../services/api.js', () => ({
  api: {
    timeseries: sharedMocks.timeseries,
    thresholdsEffective: sharedMocks.thresholdsEffective,
    quality: sharedMocks.quality,
    exportPdf: sharedMocks.exportPdf,
    notify: sharedMocks.notify,
  },
}))

import DeviceDetail from './DeviceDetail.jsx'

const devices = [{ id: 'dev-1', name: 'Device One', type: 'meter', room: 'Lab' }]
const metrics = [{ key: 'P' }, { key: 'U' }]

function renderWithRouter(component) {
  return render(
    <MemoryRouter initialEntries={['/devices/dev-1']}>
      <Routes>
        <Route path="/devices/:id" element={component} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DeviceDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders fallback when device is missing', () => {
    render(
      <MemoryRouter initialEntries={['/devices/missing']}>
        <Routes>
          <Route path="/devices/:id" element={<DeviceDetail devices={[]} metrics={metrics} />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Device not found/i)).toBeInTheDocument()
  })

  it('pushes alerts and notifies on critical metric', async () => {
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    await waitFor(() => expect(sharedMocks.timeseries).toHaveBeenCalled())
    await waitFor(() => expect(sharedMocks.pushAlert).toHaveBeenCalled())
    await waitFor(() => expect(sharedMocks.notify).toHaveBeenCalled())
  })

  it('toggles live mode and advanced/ultra fine view', async () => {
    const user = userEvent.setup()
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    const liveBtn = await screen.findByRole('button', { name: /Live/i })
    await user.click(liveBtn)
    expect(sharedMocks.uiStore.toggleLive).toHaveBeenCalled()

    const tile = await screen.findByRole('button', { name: /Voltage & Current/i })
    await user.click(tile)
    await user.click(await screen.findByRole('button', { name: /Analyse avanc/ }))
    expect(screen.getAllByText(/Analyse avanc/).length).toBeGreaterThan(0)
    const ultraBtn = screen.getByRole('button', { name: /Ultra fin/i })
    await user.click(ultraBtn)
  })

  it('invokes export actions (JSON and PDF)', async () => {
    const user = userEvent.setup()
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    const jsonButton = await screen.findByText(/Export P \(JSON\)/i)
    await user.click(jsonButton)
    await user.click(screen.getByText(/Export PDF/i))
    const { downloadText } = await import('../lib/exportUtils.js')
    expect(downloadText).toHaveBeenCalled()
    expect(sharedMocks.exportPdf).toHaveBeenCalled()
  })

  it('changes color pickers and applies thresholds', async () => {
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    const pickers = await screen.findAllByLabelText(/Couleur/i)
    fireEvent.change(pickers[0], { target: { value: '#ff0000' } })
    expect(sharedMocks.setSeriesColor).toHaveBeenCalled()
    await waitFor(() => expect(sharedMocks.getThreshold).toHaveBeenCalled())
  })

  it('adds and removes annotations', async () => {
    const user = userEvent.setup()
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    expect(screen.getByText(/Existing note/)).toBeInTheDocument()
    await user.click(screen.getByText(/Delete/i))
    expect(sharedMocks.removeAnnotation).toHaveBeenCalledWith('dev-1', 'a1')

    const ts = document.getElementById('ann-ts')
    const label = document.getElementById('ann-label')
    ts.value = '2024-01-01T00:00'
    label.value = 'New note'
    await user.click(screen.getByText(/^Add$/i))
    expect(sharedMocks.addAnnotation).toHaveBeenCalled()
  })

  it('uses quality gaps and thresholdsEffective data', async () => {
    renderWithRouter(<DeviceDetail devices={devices} metrics={metrics} />)
    await waitFor(() => expect(sharedMocks.quality).toHaveBeenCalled())
    await waitFor(() => expect(sharedMocks.thresholdsEffective).toHaveBeenCalledWith('dev-1', expect.any(Object)))
  })
})
