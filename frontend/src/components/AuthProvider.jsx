import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getUser, hasRole, isAuthenticated, login, logout, handleCallback, getAccessToken, startAutoRefresh } from '../services/oidc.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getUser())
  const [ready, setReady] = useState(true)

  // Expose a way to refresh user (after callback)
  const refresh = () => setUser(getUser())

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: () => isAuthenticated(),
    hasRole: (r) => hasRole(r),
    login: (opts) => login(opts),
    logout: () => logout(),
    refresh,
    getAccessToken,
  }), [user, ready])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function RequireRole({ role, children, fallback=null }) {
  const { isAuthenticated, hasRole } = useAuth()
  if (!isAuthenticated()) return fallback
  if (role && !hasRole(role)) return fallback
  return children
}

export function AuthCallbackView() {
  const [err, setErr] = useState('')
  const { refresh } = useAuth()
  useEffect(() => {
    (async () => {
      try {
        const res = await handleCallback(window.location.href)
        refresh()
        window.location.replace(res.redirectTo || '/')
      } catch (e) {
        setErr(String(e.message || e))
      }
    })()
  }, [])
  return <div className="panel"><div className="panel-title">Authentification…</div>{err ? <div className="badge" style={{color:'#ef4444', borderColor:'#ef4444'}}>{err}</div> : <div>Veuillez patienter…</div>}</div>
}

// Kick auto-refresh when provider mounts and a session already exists
// so access tokens are renewed before expiry.
export function AuthRefreshBootstrap() {
  useEffect(() => { try { startAutoRefresh() } catch {} }, [])
  return null
}
