import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const ack = vi.fn()
const clear = vi.fn()
const silence = vi.fn()
let logData = []
let ackedData = []

vi.mock('../components/AuthProvider.jsx', () => ({
  useAuth: () => ({ user: { email: 'ops@example.com' } }),
}))

vi.mock('../state/alerts.js', () => ({
  useAlerts: () => ({
    log: logData,
    acked: ackedData,
    clear,
    ack,
    silence,
    audit: [],
  }),
}))

import AlertsPage from './AlertsPage.jsx'

beforeEach(() => {
  logData = []
  ackedData = []
  ack.mockReset()
  clear.mockReset()
  silence.mockReset()
})

describe('Alerts page', () => {
  it('filters by level and only shows matching rows', async () => {
    const now = Date.now()
    logData = [
      { id: 'a1', level: 'warn', deviceId: 'd1', metricKey: 'P', ts: now },
      { id: 'a2', level: 'crit', deviceId: 'd2', metricKey: 'Q', ts: now - 1000 },
    ]
    ackedData = ['a1']
    render(<AlertsPage />)
    const levelSelect = screen.getByDisplayValue('All')
    fireEvent.change(levelSelect, { target: { value: 'crit' } })
    await waitFor(() => expect(screen.getByText('d2')).toBeInTheDocument())
    expect(screen.queryByText('d1')).not.toBeInTheDocument()
  })

  it('acks unacked alerts when Ack clicked', async () => {
    const now = Date.now()
    logData = [
      { id: 'a1', level: 'warn', deviceId: 'd1', metricKey: 'P', ts: now },
      { id: 'a2', level: 'crit', deviceId: 'd2', metricKey: 'Q', ts: now - 1000 },
    ]
    ackedData = ['a1']
    render(<AlertsPage />)
    const buttons = screen.getAllByRole('button', { name: 'Ack' })
    const target = buttons.find((button) => !button.disabled)
    fireEvent.click(target)
    await waitFor(() => expect(ack).toHaveBeenCalledWith('a2', 'ops@example.com'))
  })
})
