import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canonicalizePath } from './api'
import { TextEncoder } from 'util'

vi.mock('./oidc.js', () => {
  return {
    getAccessToken: vi.fn(() => 'token'),
    refreshAccessToken: vi.fn(() => Promise.resolve(true)),
  }
})

const mockEnv = {
  VITE_API_BASE: 'http://localhost:4000',
  PROD: false,
  VITE_API_TIMEOUT_MS: 200,
}

async function loadApi() {
  process.env = { ...process.env, ...mockEnv }
  global.fetch = vi.fn()
  global.location = { origin: 'http://localhost' }
  global.TextEncoder = TextEncoder
  return import('./api.js')
}

describe('api client behaviors', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('canonicalizes path with sorted query', () => {
    expect(canonicalizePath('/api/devices?b=2&a=1')).toBe('/api/devices?a=1&b=2')
  })

  it('retries on 401 after refresh', async () => {
    const { api } = await loadApi()
    global.fetch
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [] }), { status: 200 }))
    await api.devices()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 429 then succeeds', async () => {
    const { api } = await loadApi()
    global.fetch
      .mockResolvedValueOnce(new Response('rate limit', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [] }), { status: 200 }))
    await api.devices()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('adds HMAC headers when configured', async () => {
    process.env.VITE_API_HMAC_KEY_ID = 'kid'
    process.env.VITE_API_HMAC_SECRET = 'secret'
    const { api } = await loadApi()
    const fakeSig = new Uint8Array([1, 2, 3])
    vi.stubGlobal('crypto', {
      subtle: {
        digest: () => Promise.resolve(new ArrayBuffer(0)),
        importKey: () => Promise.resolve({}),
        sign: () => Promise.resolve(fakeSig.buffer),
      },
      randomUUID: () => 'nonce',
    })
    global.fetch.mockResolvedValue(new Response(JSON.stringify({ devices: [] }), { status: 200 }))
    await api.devices()
    const headers = global.fetch.mock.calls[0][1].headers
    expect(headers['x-api-key-id']).toBe('kid')
    expect(headers['x-api-signature']).toBeDefined()
  })

  it('retries and aborts on timeout errors', async () => {
    const { api } = await loadApi()
    const abortErr = new DOMException('Aborted', 'AbortError')
    global.fetch.mockRejectedValue(abortErr)
    await expect(api.devices()).rejects.toThrow()
    expect(global.fetch).toHaveBeenCalledTimes(4)
  })
})
