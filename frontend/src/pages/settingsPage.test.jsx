import React from 'react'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setOptions = vi.fn()
const setThreshold = vi.fn()
const devices = [{ id: 'd1', name: 'Device 1' }]
const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getThresholds: vi.fn(),
    kpis: vi.fn(),
    putThresholds: vi.fn(),
  },
}))

vi.mock('../state/filters.js', () => ({
  useUiStore: () => ({
    period: { key: '24h' },
    setPeriodKey: vi.fn(),
    refreshNow: vi.fn(),
    devices,
  }),
}))

vi.mock('../state/settings.js', () => ({
  useSettings: () => ({
    options: {
      bucketMs: 60000,
      smoothing: false,
      smoothingMode: 'SMA',
      smoothingWindow: 5,
      showBaseline: true,
      showForecast: false,
      yScale: 'linear',
      theme: 'light',
      lang: 'fr',
    },
    setOptions,
    getThreshold: () => ({ warn: 10, crit: 20, direction: 'above' }),
    setThreshold,
  }),
}))

vi.mock('../services/api.js', () => ({
  api: apiMock,
}))

import SettingsPage from './SettingsPage.jsx'

const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

beforeEach(() => {
  setOptions.mockReset()
  setThreshold.mockReset()
  alertSpy.mockReset()
  alertSpy.mockImplementation(() => {})
  apiMock.getThresholds.mockReset()
  apiMock.kpis.mockReset()
  apiMock.putThresholds.mockReset()
})

afterAll(() => {
  alertSpy.mockRestore()
})

describe('Settings page', () => {
  it('saves deadband successfully and alerts user', async () => {
    apiMock.getThresholds.mockResolvedValueOnce({ global: {}, options: { deadbandPct: 5 } })
    apiMock.kpis.mockResolvedValue({ kpis: { P: { last: 10 } } })
    apiMock.putThresholds.mockResolvedValue({})
    render(<SettingsPage />)
    await waitFor(() => expect(apiMock.getThresholds).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Deadband (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Save deadband'))
    await waitFor(() => expect(apiMock.putThresholds).toHaveBeenCalledWith({ options: { deadbandPct: 10 } }))
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/deadband mis/i))
  })

  it('shows error alert when save fails', async () => {
    apiMock.getThresholds.mockResolvedValueOnce({ global: {}, options: { deadbandPct: 5 } })
    apiMock.kpis.mockResolvedValue({ kpis: {} })
    apiMock.putThresholds.mockRejectedValue(new Error('boom'))
    render(<SettingsPage />)
    await waitFor(() => expect(apiMock.getThresholds).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Deadband (%)'), { target: { value: '8' } })
    fireEvent.click(screen.getByText('Save deadband'))
    await waitFor(() => expect(apiMock.putThresholds).toHaveBeenCalled())
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('chec de mise'))
  })

  it('rejects invalid deadband before calling API', async () => {
    apiMock.getThresholds.mockResolvedValueOnce({ global: {}, options: { deadbandPct: 5 } })
    apiMock.kpis.mockResolvedValue({ kpis: {} })
    render(<SettingsPage />)
    await waitFor(() => expect(apiMock.getThresholds).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Deadband (%)'), { target: { value: '-5' } })
    fireEvent.click(screen.getByText('Save deadband'))
    expect(apiMock.putThresholds).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith('Valeur invalide')
  })
})
