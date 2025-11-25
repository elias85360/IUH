import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual, default: actual }
})

// Common heavy component mocks
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

let uiStoreMock
let assetsMock
let alertsMock
let settingsMock
let apiMock
let authMock

vi.mock('../state/filters.js', () => ({ useUiStore: () => uiStoreMock }))
vi.mock('../state/assets.js', () => ({ useAssets: () => assetsMock }))
vi.mock('../state/alerts.js', () => ({ useAlerts: () => alertsMock }))
vi.mock('../state/settings.js', () => ({ useSettings: () => settingsMock, defaultSeriesColors: {} }))
vi.mock('../services/api.js', () => ({ get api() { return apiMock } }))
vi.mock('../components/AuthProvider.jsx', () => ({ useAuth: () => authMock }))
global.React = React

describe('Page states with mocked data', () => {
  beforeEach(() => {
    uiStoreMock = {
      period: { key: '1h', ms: 3600000, bucketMs: 60000 },
      anchorNow: Date.now(),
      devices: [{ id: 'd1', name: 'Device 1' }],
      excludedDevices: [],
      toggleExclude: vi.fn(),
      setPeriodKey: vi.fn(),
      refreshNow: vi.fn(),
      setDevices: vi.fn(),
      setMetrics: vi.fn(),
      setFilters: vi.fn(),
    }
    assetsMock = { meta: {}, setMeta: vi.fn(), setAll: vi.fn(), reset: vi.fn() }
    alertsMock = {
      log: [{ id: 'a1', deviceId: 'd1', metricKey: 'P', ts: Date.now(), level: 'warn', value: 1 }],
      acked: [],
      audit: [],
      clear: vi.fn(),
      ack: vi.fn(),
      silence: vi.fn(),
    }
    settingsMock = {
      options: {},
      setOptions: vi.fn(),
      getThreshold: vi.fn(() => ({})),
      setThreshold: vi.fn(),
    }
    apiMock = {
      quality: vi.fn().mockResolvedValue({
        items: [{ deviceId: 'd1', deviceName: 'Device 1', metricKey: 'P', unit: 'W', freshnessMs: 5000, completeness: 0.5, gaps: 1 }],
      }),
      getThresholds: vi.fn().mockResolvedValue({ global: { P: { warn: 1, crit: 2 } }, options: { deadbandPct: 5 } }),
      kpis: vi.fn().mockResolvedValue({ kpis: {} }),
      putThresholds: vi.fn().mockResolvedValue({ ok: true }),
      devices: vi.fn().mockResolvedValue({ devices: [] }),
    }
    authMock = { user: { sub: 'u1', email: 'u1@test' }, login: vi.fn(), logout: vi.fn() }
    vi.clearAllMocks()
  })

  it('renders AlertsPage and triggers clear', async () => {
    const { default: AlertsPage } = await import('./AlertsPage.jsx')
    render(
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Alerts Log/i)).toBeInTheDocument()
    expect(screen.getByText('d1')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Clear/i))
    expect(alertsMock.clear).toHaveBeenCalledWith(expect.stringMatching(/u1/))
  })

  it('renders DataHealth with quality rows', async () => {
    const { default: DataHealth } = await import('./DataHealth.jsx')
    render(
      <MemoryRouter>
        <DataHealth />
      </MemoryRouter>
    )
    await waitFor(() => expect(apiMock.quality).toHaveBeenCalled())
    const devices = await screen.findAllByText('Device 1')
    expect(devices.length).toBeGreaterThan(0)
    expect(screen.getByText('P')).toBeInTheDocument()
  })

  it('saves deadband settings from SettingsPage', async () => {
    window.alert = vi.fn()
    const { default: SettingsPage } = await import('./SettingsPage.jsx')
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(apiMock.getThresholds).toHaveBeenCalled())
    const input = await screen.findByLabelText(/Deadband/i)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.click(screen.getByText(/Save deadband/i))
    await waitFor(() => expect(apiMock.putThresholds).toHaveBeenCalled())
    expect(apiMock.putThresholds).toHaveBeenCalledWith({ options: { deadbandPct: 7 } })
  })
})
