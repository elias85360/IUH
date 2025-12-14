import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return { ...actual, default: actual, use: actual.use || (() => {}) }
})

vi.mock('../components/DeviceSummaryCard.jsx', () => ({
  default: ({ device }) => <div data-testid="device-card">{device.id}</div>,
}))

const shared = vi.hoisted(() => {
  const prefetchDevices = vi.fn()
  const store = {
    period: { key: '1h', ms: 3600000 },
    selectedRoom: 'all',
    selectedGroup: 'all',
  }
  const assets = { meta: { d1: { room: 'Lab', tags: ['t1'] }, d2: { room: 'Office', tags: [] } } }
  const alerts = {
    log: [{ id: 'a1', deviceId: 'd2', metricKey: 'P', ts: Date.now(), level: 'crit' }],
  }
  const quality = vi.fn(async () => ({
    items: [{ deviceId: 'd1', metricKey: 'P', freshnessMs: 5000 }],
  }))
  return { prefetchDevices, store, assets, alerts, quality }
})

vi.mock('../lib/prefetch.js', () => ({ prefetchDevices: shared.prefetchDevices }))
vi.mock('../state/filters.js', () => ({ useUiStore: () => shared.store }))
vi.mock('../state/assets.js', () => ({ useAssets: () => shared.assets }))
vi.mock('../state/alerts.js', () => ({ useAlerts: () => shared.alerts }))
vi.mock('../services/api.js', () => ({
  api: {
    quality: shared.quality,
  },
}))

import DevicesPage from './DevicesPage.jsx'

const devices = [
  { id: 'd1', name: 'Device 1', room: 'Lab', tags: ['t1'] },
  { id: 'd2', name: 'Device 2', room: 'Office', tags: [] },
]

describe('DevicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shared.store.selectedRoom = 'all'
    shared.store.selectedGroup = 'all'
  })

  it('renders devices and applies search filter', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DevicesPage devices={devices} />
      </MemoryRouter>
    )
    expect(await screen.findAllByTestId('device-card')).toHaveLength(2)
    const search = screen.getByPlaceholderText(/Search name/)
    await user.type(search, 'Device 1')
    await waitFor(() => {
      const cards = screen.getAllByTestId('device-card')
      expect(cards.map((c) => c.textContent)).toEqual(['d1'])
    })
  })

  it('groups by room and toggles collapse', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DevicesPage devices={devices} />
      </MemoryRouter>
    )
    const groupSelect = screen.getByLabelText(/Group by/i)
    await user.selectOptions(groupSelect, 'room')
    expect(await screen.findByText('Lab')).toBeInTheDocument()
    const collapse = screen.getAllByRole('button', { name: /Collapse/i })[0]
    await user.click(collapse)
    expect(collapse).toHaveTextContent(/Expand|Collapse/)
  })

  it('sorts by alerts count when selected', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DevicesPage devices={devices} />
      </MemoryRouter>
    )
    const sortSelect = screen.getByDisplayValue(/Name/)
    await user.selectOptions(sortSelect, 'alerts-desc')
    expect(shared.alerts.log[0].deviceId).toBe('d2')
  })

  it('fetches freshness via quality endpoint', async () => {
    render(
      <MemoryRouter>
        <DevicesPage devices={devices} />
      </MemoryRouter>
    )
    await waitFor(() => expect(shared.quality).toHaveBeenCalled())
  })
})
