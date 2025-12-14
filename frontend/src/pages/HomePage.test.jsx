import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual, default: actual, use: actual.use || (() => {}) }
})

vi.mock('react-grid-layout', () => {
  const Dummy = ({ children }) => <div data-testid="grid">{children}</div>
  const WidthProvider = (Comp) => Comp
  return { Responsive: Dummy, WidthProvider }
})

vi.mock('react-chartjs-2', () => ({
  Doughnut: () => <div data-testid="doughnut" />,
  Line: () => <div />,
}))

vi.mock('recharts', () => {
  const Stub = ({ children }) => <div data-testid="recharts-stub">{children}</div>
  const Leaf = () => <div data-testid="recharts-leaf" />
  return {
    ResponsiveContainer: Stub,
    AreaChart: Stub,
    Area: Leaf,
    XAxis: Leaf,
    YAxis: Leaf,
    Tooltip: Leaf,
    CartesianGrid: Leaf,
  }
})

const shared = vi.hoisted(() => {
  const prefetchHome = vi.fn()
  const prefetchDevices = vi.fn()
  const setFilters = vi.fn()
  const store = {
    period: { key: '1h', ms: 3600000, label: '1h' },
    anchorNow: 1_700_000_000_000,
    selectedRoom: 'all',
    selectedTags: [],
    setFilters,
  }
  const assets = { meta: {} }
  const timeseries = vi.fn(async (_id, metricKey) => ({
    points: [
      { ts: store.anchorNow - 1000, value: metricKey === 'temp' ? 10 : 20 },
      { ts: store.anchorNow - 500, value: metricKey === 'temp' ? 20 : 40 },
    ],
  }))
  const quality = vi.fn(async () => ({
    items: [
      { deviceId: 'd1', completeness: 0.5, freshnessMs: 30 * 60 * 1000 },
      { deviceId: 'd2', completeness: 1, freshnessMs: 2 * 60 * 60 * 1000 },
    ],
  }))
  return { prefetchHome, prefetchDevices, store, assets, timeseries, quality }
})

vi.mock('../lib/prefetch.js', () => ({
  prefetchHome: shared.prefetchHome,
  prefetchDevices: shared.prefetchDevices,
}))
vi.mock('../state/filters.js', () => ({ useUiStore: () => shared.store }))
vi.mock('../state/assets.js', () => ({ useAssets: () => shared.assets }))
vi.mock('../components/StatCards.jsx', () => ({ default: () => <div data-testid="statcards" /> }))
vi.mock('../components/RoomContribution.jsx', () => ({ default: ({ onSelectRoom }) => (
  <button onClick={() => onSelectRoom('Lab')} data-testid="room-contrib">Room contrib</button>
) }))
vi.mock('../services/api.js', () => ({
  api: {
    timeseries: shared.timeseries,
    quality: shared.quality,
  },
}))

import HomePage from './HomePage.jsx'

const devices = [
  { id: 'd1', name: 'Device 1', room: 'Lab' },
  { id: 'd2', name: 'Device 2', room: 'Office' },
]

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shared.store.selectedRoom = 'all'
    shared.store.selectedTags = []
  })

  it('renders devices and quality donut', async () => {
    render(
      <MemoryRouter>
        <HomePage devices={devices} />
      </MemoryRouter>
    )
    expect(await screen.findAllByRole('heading', { name: /Devices/i })).not.toHaveLength(0)
    await waitFor(() => expect(shared.quality).toHaveBeenCalled())
    expect(screen.getByText(/Data Freshness/i)).toBeInTheDocument()
    expect(screen.getByText(/50%/)).toBeInTheDocument()
  })

  it('clears room filter when badge clicked', async () => {
    shared.store.selectedRoom = 'Lab'
    render(
      <MemoryRouter>
        <HomePage devices={devices} />
      </MemoryRouter>
    )
    const badge = (await screen.findAllByText(/Room: Lab/))[0]
    const clearBtn = badge.querySelector('button')
    clearBtn && fireEvent.click(clearBtn)
    expect(shared.store.setFilters).toHaveBeenCalledWith({ selectedRoom: 'all' })
  })

  it('renders metric tile averages', async () => {
    render(
      <MemoryRouter>
        <HomePage devices={devices} />
      </MemoryRouter>
    )
    await waitFor(() => expect(shared.timeseries).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: /Average Temperature/i })).toBeInTheDocument()
    expect(screen.getAllByText(/15\.0/)[0]).toBeInTheDocument()
  })

  it('updates dual donut selection', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <HomePage devices={devices} />
      </MemoryRouter>
    )
    await waitFor(() => expect(shared.timeseries).toHaveBeenCalled())
    const select = screen.getAllByLabelText(/Device/)[0]
    await user.selectOptions(select, 'd2')
    await waitFor(() => {
      expect(shared.timeseries).toHaveBeenCalledWith('d2', expect.any(String), expect.any(Object))
    })
  })
})
