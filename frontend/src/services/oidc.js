// Minimal OIDC (Authorization Code + PKCE) client for the frontend.
// No external dependencies. Stores tokens in sessionStorage.

const ISSUER = import.meta.env.VITE_OIDC_ISSUER_URL
const CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_OIDC_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin : '')
const STORAGE_KEY = 'oidc.session'
let refreshTimer = null

function randString(len = 64) {
  const arr = new Uint8Array(len)
  if  ( typeof crypto !== 'undefined' && crypto.getRandomValues ) {
    crypto.getRandomValues(arr)
  } else {
    for (let i = 0; i < len; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(arr).map(b => ('0' + b.toString(16)).slice(-2)).join('')
}

async function sha256(str) {
  const enc = new TextEncoder()
  const data = enc.encode(str)
  //crypto.subtle only works in secure contexts (https ou localhost)
  // Sur http://192.168.x.x il peut être undefined -> on desactive le PKCE et on revient à un flow classique
  if ( typeof crypto !== ' undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function' ) {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return new Uint8Array(digest)
  }
  return null
}

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes))
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(payload)
    return JSON.parse(json)
  } catch { return null }
}

function saveSession(s) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}
function loadSession() {
  try { const s = sessionStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function clearSession() { try { sessionStorage.removeItem(STORAGE_KEY) } catch {} }

export function getAccessToken() {
  const s = loadSession(); return s && s.access_token ? s.access_token : ''
}

export function getUser() {
  const s = loadSession(); return s && s.id_token ? decodeJwt(s.id_token) : null
}

function getExp(token) {
  try { const p = decodeJwt(token); return p && p.exp ? Number(p.exp) : 0 } catch { return 0 }
}

export async function refreshAccessToken() {
  const s = loadSession(); if (!s || !s.refresh_token) return null
  const tokenUrl = ISSUER.replace(/\/$/,'') + '/protocol/openid-connect/token'
  const body = new URLSearchParams()
  body.set('grant_type', 'refresh_token')
  body.set('client_id', CLIENT_ID)
  body.set('refresh_token', s.refresh_token)
  console.log('Refreshing token with:', {
    client_id: CLIENT_ID,
    refresh_token: s.refresh_token
  })

  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  console.log('Refresh response status:', res.status)
  console.log('Refresh response body:', await res.text())

  if (!res.ok) return null
  const next = await res.json()
  const merged = { ...s, ...next, savedAt: Date.now() }
  saveSession(merged)
  scheduleRefresh()
  return merged
}

function scheduleRefresh() {
  try { if (refreshTimer) clearTimeout(refreshTimer) } catch {}
  const s = loadSession(); if (!s || !s.access_token) return
  const exp = getExp(s.access_token) // seconds
  if (!exp) return
  const nowSec = Math.floor(Date.now()/1000)
  const lead = 60 // refresh 60s before expiry
  const delayMs = Math.max(1000, (exp - nowSec - lead) * 1000)
  refreshTimer = setTimeout(() => { refreshAccessToken().catch(()=>{}) }, delayMs)
}

export function startAutoRefresh() { try { scheduleRefresh() } catch {} }

function getAccessPayload() {
  const tok = getAccessToken(); return tok ? decodeJwt(tok) : null
}

export function hasRole(role) {
  const payload = getAccessPayload() || getUser()
  if (!payload) return false
  const clientId = CLIENT_ID
  const roles = new Set()
  if (payload.realm_access && payload.realm_access.roles) {
    for (const r of payload.realm_access.roles) roles.add(String(r))
  }
  if (payload.resource_access && clientId && payload.resource_access[clientId] && payload.resource_access[clientId].roles) {
    for (const r of payload.resource_access[clientId].roles) roles.add(String(r))
  }
  return roles.has('admin') || roles.has(role)
}

export async function login({ redirectTo } = {}) {
  if (!ISSUER || !CLIENT_ID) throw new Error('OIDC not configured')
  const state = randString(16)
  const codeVerifier = randString(64)
  let challenge = null
  const hash = await sha256(codeVerifier)
  if (hash) {
    challenge = b64url(hash)
  }
  const authUrl = new URL(ISSUER.replace(/\/$/,'') + '/protocol/openid-connect/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid profile email')
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI.replace(/\/$/, '') + '/auth/callback')
  authUrl.searchParams.set('state', state)
  if (challenge) {
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
  }
  try { sessionStorage.setItem('oidc.tmp', JSON.stringify({ state, codeVerifier, redirectTo: redirectTo || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/') })) } catch {}
  window.location.assign(authUrl.toString())
}

export async function handleCallback(currentUrl) {
  const u = new URL(currentUrl)
  const code = u.searchParams.get('code')
  const state = u.searchParams.get('state')
  const tmp = JSON.parse(sessionStorage.getItem('oidc.tmp') || '{}')
  if (!code || !state || !tmp || state !== tmp.state) throw new Error('invalid callback')
  const tokenUrl = ISSUER.replace(/\/$/,'') + '/protocol/openid-connect/token'
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('client_id', CLIENT_ID)
  body.set('redirect_uri', REDIRECT_URI.replace(/\/$/, '') + '/auth/callback')
  if (tmp.codeVerifier) {
    body.set('code_verifier', tmp.codeVerifier)
  }
  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  if (!res.ok) throw new Error('token exchange failed')
  const tokens = await res.json()
  const session = { ...tokens, savedAt: Date.now() }
  saveSession(session)
  scheduleRefresh()
  try { sessionStorage.removeItem('oidc.tmp') } catch {}
  return { redirectTo: tmp.redirectTo || '/' }
}

export function logout() {
  const s = loadSession()
  clearSession()
  try { if (refreshTimer) clearTimeout(refreshTimer) } catch {}
  const endSession = ISSUER && (ISSUER.replace(/\/$/,'') + '/protocol/openid-connect/logout')
  if (endSession && s && s.id_token) {
    const url = new URL(endSession)
    url.searchParams.set('post_logout_redirect_uri', REDIRECT_URI)
    url.searchParams.set('id_token_hint', s.id_token)
    window.location.assign(url.toString())
  } else {
    if (typeof window !== 'undefined') window.location.assign('/')
  }
}

export function isAuthenticated() { return !!getAccessToken() || !!getUser() }
