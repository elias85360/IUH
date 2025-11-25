import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const toggleExclude = vi.fn()
const setMeta = vi.fn()
const { mockQuality, mockPutAssetsMeta } = vi.hoisted(() => ({
  mockQuality: vi.fn(),
  mockPutAssetsMeta: vi.fn(),
}))

vi.mock('../services/api.js', () => ({
  api: {
    quality: mockQuality,
    putAssetsMeta: mockPutAssetsMeta,
  },
}))

vi.mock('../state/filters.js', () => ({
  useUiStore: () => ({
    period: { key: '1h', ms: 3600000 },
    anchorNow: Date.now(),
    devices: [{ id: 'd1', name: 'Device 1' }],
    excludedDevices: [],
    toggleExclude,
  }),
}))

vi.mock('../state/assets.js', () => ({
  useAssets: () => ({ meta: {}, setMeta }),
}))

import DataHealth from './DataHealth.jsx'

beforeEach(() => {
  mockQuality.mockReset()
  mockPutAssetsMeta.mockReset()
  toggleExclude.mockReset()
  setMeta.mockReset()
})

describe('DataHealth page', () => {
  it('renders empty table when no data returned', async () => {
    mockQuality.mockResolvedValueOnce({ items: [] })
    render(<DataHealth />)
    await waitFor(() => expect(mockQuality).toHaveBeenCalled())
    expect(screen.getByText((txt) => txt.toLowerCase().includes('santé des données'))).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBe(1)
    expect(screen.queryByText(/Heatmap de compl/)).not.toBeInTheDocument()
  })

  it('colors completeness, shows heatmap and toggles excludes', async () => {
    const now = Date.now()
    const items = [
      {
        deviceId: 'd1',
        metricKey: 'P',
        deviceName: 'Device 1',
        unit: 'W',
        lastTs: now - 7 * 60 * 60 * 1000,
        freshnessMs: 7 * 60 * 60 * 1000,
        completeness: 0.5,
        gaps: 3,
        bucketsPresent: [now - 7 * 60 * 60 * 1000],
        bucketsExpected: 24,
        presentBuckets: [now - 7 * 60 * 60 * 1000],
      },
      {
        deviceId: 'd2',
        metricKey: 'Q',
        deviceName: 'Device 2',
        unit: 'kW',
        lastTs: now - 30 * 60 * 1000,
        freshnessMs: 30 * 60 * 1000,
        completeness: 0.97,
        gaps: 1,
        bucketsPresent: [now - 30 * 60 * 1000],
        bucketsExpected: 24,
        presentBuckets: [now - 30 * 60 * 1000],
      },
    ]
    mockQuality.mockResolvedValueOnce({ items, from: now - 3600000, to: now, bucketMs: 3600000 })
    mockPutAssetsMeta.mockResolvedValue({})
    render(<DataHealth />)
    await waitFor(() => expect(mockQuality).toHaveBeenCalled())
    expect(screen.getByText(/Heatmap de compl/)).toBeInTheDocument()
    expect(document.querySelector('.status-chip.crit')).toBeInTheDocument()
    const percent = screen.getByText('50%')
    const bar = percent.previousElementSibling?.firstElementChild
    expect(bar).toHaveStyle({ background: '#ef4444' })
    const checkboxes = screen.getAllByLabelText('Exclude from dashboards')
    fireEvent.click(checkboxes[0])
    await waitFor(() => expect(toggleExclude).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(mockPutAssetsMeta).toHaveBeenCalledWith({ d1: { exclude: true } }, false))
    expect(setMeta).toHaveBeenCalledWith('d1', { exclude: true })
  })
})
