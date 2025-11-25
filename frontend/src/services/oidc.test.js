import { describe, it, expect, vi, beforeEach } from 'vitest'

const tokens = {
  access_token: 'abc.def.ghi',
  refresh_token: 'r1',
  id_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, realm_access: { roles: ['admin'] } })) + '.sig',
}

describe('oidc helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...process.env,
      VITE_OIDC_ISSUER_URL: 'http://issuer',
      VITE_OIDC_CLIENT_ID: 'client',
      VITE_OIDC_REDIRECT_URI: 'http://localhost',
    }
    global.sessionStorage = {
      _s: new Map(),
      getItem: (k) => (sessionStorage._s.has(k) ? sessionStorage._s.get(k) : null),
      setItem: (k, v) => sessionStorage._s.set(k, v),
      removeItem: (k) => sessionStorage._s.delete(k),
    }
    sessionStorage.setItem('oidc.session', JSON.stringify(tokens))
  })

  it('returns access token and evaluates roles', async () => {
    const mod = await import('./oidc.js')
    expect(mod.getAccessToken()).toBe(tokens.access_token)
    expect(mod.hasRole('viewer')).toBe(true)
  })

  it('refreshes token with fetch', async () => {
    const body = { access_token: 'new.access', refresh_token: 'new.refresh', id_token: tokens.id_token }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body), status: 200, text: () => Promise.resolve('') })
    const mod = await import('./oidc.js')
    const next = await mod.refreshAccessToken()
    expect(next.access_token).toBe('new.access')
    expect(global.fetch).toHaveBeenCalled()
  })

  it('handles callback and clears tmp state', async () => {
    const tokensResp = { access_token: 'x', refresh_token: 'y', id_token: tokens.id_token }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(tokensResp) })
    const mod = await import('./oidc.js')
    sessionStorage.setItem('oidc.tmp', JSON.stringify({ state: 's1', codeVerifier: null, redirectTo: '/after' }))
    const res = await mod.handleCallback('http://localhost/auth/callback?code=abc&state=s1')
    expect(res.redirectTo).toBe('/after')
    expect(sessionStorage.getItem('oidc.tmp')).toBeNull()
  })

  it('logout clears session and redirects', async () => {
    const mod = await import('./oidc.js')
    global.window = { location: { assign: vi.fn() } }
    sessionStorage.setItem('oidc.session', JSON.stringify(tokens))
    mod.logout()
    expect(sessionStorage.getItem('oidc.session')).toBeNull()
    expect(window.location.assign).toHaveBeenCalled()
  })

  it('login builds correct auth URL', async () => {
    const mod = await import('./oidc.js')
    global.window = { location: { assign: vi.fn(), origin: 'http://localhost', pathname: '/', search: '' } }
    await mod.login()
    const called = window.location.assign.mock.calls[0][0]
    expect(called).toContain('client_id=client')
    expect(called).toContain('/protocol/openid-connect/auth')
    expect(called).toContain(encodeURIComponent('http://localhost/auth/callback'))
  })

  it('rejects callback when state mismatches', async () => {
    const mod = await import('./oidc.js')
    sessionStorage.setItem('oidc.tmp', JSON.stringify({ state: 'expected', codeVerifier: null, redirectTo: '/' }))
    await expect(mod.handleCallback('http://localhost/auth/callback?code=abc&state=bad')).rejects.toThrow('invalid callback')
  })
})
