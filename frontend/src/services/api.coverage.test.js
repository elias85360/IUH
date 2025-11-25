import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.stubEnv('VITE_DATA_SOURCE', '')

const makeJsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
  headers: { get: () => 'application/json' },
})

describe('api client helpers', () => {
  let api
  let getBaseUrl
  let fetchMock

  beforeEach(async () => {
    vi.resetModules()
    fetchMock = vi.fn(() => Promise.resolve(makeJsonResponse({ kpis: [] })))
    global.fetch = fetchMock
    const mod = await import('./api.js')
    api = mod.api
    getBaseUrl = mod.getBaseUrl
  })

  afterEach(() => {
    vi.resetAllMocks()
    delete global.fetch
  })

  it('calls /api/kpis with device query and returns data', async () => {
    const value = await api.kpis('d1', 1, 2)
    expect(value).toEqual({ kpis: [] })
    const firstCall = fetchMock.mock.calls[0][0]
    expect(firstCall).toContain('/api/kpis?deviceId=d1')
    expect(firstCall).toContain('from=1')
    expect(firstCall).toContain('to=2')
  })

  it('builds quality query string', async () => {
    await api.quality({ from: 5, to: 8, bucketMs: 60000, detail: '1' })
    const call = fetchMock.mock.calls[0][0]
    expect(call).toContain('/api/quality?')
    expect(call).toContain('from=5')
    expect(call).toContain('to=8')
    expect(call).toContain('bucketMs=60000')
    expect(call).toContain('detail=1')
  })

  it('exportCsvUrl points to base export.csv endpoint', () => {
    const url = api.exportCsvUrl('d1', 'P', 1, 2)
    expect(url).toContain('/api/export.csv')
    expect(url).toContain('deviceId=d1')
    expect(url).toContain('metricKey=P')
  })

  it('exportPdf triggers fetch with expected params', async () => {
    await api.exportPdf('d1', 10, 20, 'Report')
    const last = fetchMock.mock.calls[0][0]
    expect(last).toContain('/api/export.pdf?')
    expect(last).toContain('deviceId=d1')
    expect(last).toContain('from=10')
    expect(last).toContain('to=20')
    expect(last).toContain('title=Report')
  })

  it('throws ApiError on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
      headers: { get: () => 'text/plain' },
    })
    await expect(api.kpis('d1')).rejects.toMatchObject({ status: 500, isApiError: true })
  })
})
