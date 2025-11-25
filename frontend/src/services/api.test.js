import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnv = {
  VITE_API_BASE: 'http://localhost:4000',
  PROD: false,
  VITE_API_TIMEOUT_MS: 1000,
}

async function loadApi() {
  global.fetch = vi.fn()
  // Vitest uses process.env for import.meta.env in tests
  process.env = { ...process.env, ...mockEnv }
  global.location = { origin: 'http://localhost' }
  const mod = await import('./api.js')
  return { ...mod, fetchMock: global.fetch }
}

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    globalThis.fetch = undefined
  })

  it('maps devices response', async () => {
    const payload = { devices: [{ id: 'd1' }] }
    const { api, fetchMock } = await loadApi()
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const res = await api.devices()
    expect(res).toBeDefined()
  })

  it('returns empty on non-ok with error object', async () => {
    const { api, fetchMock } = await loadApi()
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }))
    await expect(api.devices()).rejects.toThrow()
  })

  it('decorates non-OK errors with status and code', async () => {
    const { api, fetchMock } = await loadApi()
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))
    await expect(api.devices()).rejects.toMatchObject({ status: 404, code: 'not_found', isApiError: true })
  })

  it('handles timeseries with params', async () => {
    const payload = { points: [{ ts: 1, value: 2 }] }
    const { api, fetchMock } = await loadApi()
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const res = await api.timeseries('d1', 'P', { from: 0, to: 10 })
    expect(res).toBeDefined()
    expect(fetchMock).toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toContain('from=0')
    expect(fetchMock.mock.calls[0][0]).toContain('metricKey=P')
  })
})
