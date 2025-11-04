import { useEffect, useMemo, useState } from 'react'
import TopProgress from './components/TopProgress.jsx'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Breadcrumbs from './components/Breadcrumbs.jsx'
import SideNav from './components/SideNav.jsx'
import ShareLink from './components/ShareLink.jsx'
import { RequireRole, AuthCallbackView, useAuth } from './components/AuthProvider.jsx'
import { I18nProvider, useI18n } from './lib/i18n.jsx'
import { useSettings } from './state/settings.js'
import { useScenes } from './state/scenes.js'
import HomePage from './pages/HomePage.jsx'
import DevicesPage from './pages/DevicesPage.jsx'
import DeviceDetail from './pages/DeviceDetail.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import AssetsPage from './pages/AssetsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import DataHealth from './pages/DataHealth.jsx'
import { useUiStore } from './state/filters.js'
import { api } from './services/api.js'
import { prefetchHome } from './lib/prefetch.js'
import { getSocket, subscribeSeries } from './services/socket.js'
import { useDataCache } from './state/dataCache.js'
import { useAlerts } from './state/alerts.js'
import { isAuthenticated, startAutoRefresh } from './services/oidc.js'
 
function LoginControls() {
  const { isAuthenticated, user, login, logout, hasRole } = useAuth()
  const { lang, setLang } = useI18n()
  if (!isAuthenticated()) return <button className="btn" onClick={()=>login({ redirectTo: window.location.pathname + window.location.search })}>Se connecter</button>
  const roles = []
  if (hasRole('admin')) roles.push('admin')
  else {
    if (hasRole('analyst')) roles.push('analyst')
    if (hasRole('viewer')) roles.push('viewer')
  }
  return (
    <div className="row" style={{gap:8}}>
      <span className="badge">{user?.preferred_username || 'user'} ({roles.join(',')||'auth'})</span>
      <select className="select" value={lang} onChange={(e)=>setLang(e.target.value)}>
        <option value="fr">fr</option>
        <option value="en">en</option>
      </select>
      <button className="btn" onClick={logout}>Se déconnecter</button>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const { loaded, loading, setLoaded, setLoading, devices, setDevices, metrics, setMetrics, period, setFilters, selectedRoom, selectedGroup } = useUiStore()
  const { add: addScene } = useScenes()
  const [error, setError] = useState('')

  const cache = useDataCache()
  const alerts = useAlerts()
  const { live, selectedMetrics } = useUiStore()
  useEffect(()=>{
    const s = getSocket()
    s.on('hello', ()=>{})
    s.on('alert', (a)=>{ console.warn('ALERT', a); alerts.push(a) })
    s.on('point', (p)=>{
      if (!live) return
      if (selectedMetrics?.length && !selectedMetrics.includes(p.metricKey)) return
      cache.upsertPoint(p.deviceId, p.metricKey, p.ts, p.value)
    })
    return ()=>{ s.off('point'); s.off('alert'); s.close() }
  }, [live, selectedMetrics])

  const { isAuthenticated, login } = useAuth()
  const REQUIRE_AUTH = (import.meta.env.VITE_REQUIRE_AUTH || '0') === '1'

  const onLoad = async () => {

    setError(''); setLoading(true)
    try {
      // Enforce auth only when explicitly required (prod)
      if (REQUIRE_AUTH && !isAuthenticated()) {
        setLoading(false)
        return login({ redirectTo: window.location.pathname + window.location.search })
      }
      const [dRes, mRes] = await Promise.all([api.devices(), api.metrics()])
      setDevices(dRes.devices || [])
      console.log('Devices:', dRes.devices)
      setMetrics(mRes.metrics || [])
      console.log('Metrics:', mRes.metrics)
      // Prefetch is handled by each page; avoid double prefetch here
      setLoaded(true)
    } catch (e) { setError(String(e.message||e)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
      if (!loaded && isAuthenticated()) {
        startAutoRefresh()
        onLoad()
      }
    }, [loaded, isAuthenticated])

  // Apply URL state (?period=&room=&group=) on first mount
  useEffect(()=>{
    const params = new URLSearchParams(location.search)
    const qp = params.get('period')
    const room = params.get('room')
    const group = params.get('group')
    const layout = params.get('layout')
    const map = { 'today':'24h','24h':'24h','7d':'7d','1m':'1m','3m':'3m' }
    if (qp || room || group) {
      const key = map[qp] || qp
      const msMap = { '24h': 24*60*60*1000, '7d': 7*24*60*60*1000, '1m': 30*24*60*60*1000, '3m': 90*24*60*60*1000 }
      const p = key && msMap[key] ? { key, label:key, ms: msMap[key] } : undefined
      setFilters({ ...(p? { period: p, anchorNow: Date.now() } : {}), ...(room? { selectedRoom: room } : {}), ...(group? { selectedGroup: group } : {}) })
    }
    if (layout) {
      try { localStorage.setItem('home-layout', decodeURIComponent(layout)) } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredDevices = devices

  useEffect(()=>{
    if (!filteredDevices.length || !Array.isArray(metrics) || !metrics.length) return
    const keys = metrics.map(m => m.key)
    for (const d of filteredDevices) {
      for (const mk of keys) subscribeSeries(d.id, mk)
    }
  }, [filteredDevices, metrics])

  // Apply theme from settings on mount
  const { options } = useSettings()
  useEffect(()=>{ try { document.documentElement.setAttribute('data-theme', options.theme || 'dark') } catch {} }, [options.theme])

  return (
    <I18nProvider defaultLang={options.lang || 'fr'}>
      <SideNav />
      <div className="container page">
        <TopProgress active={loading} />
        <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginTop:12}}>
          <Breadcrumbs />
          <div className="row" style={{gap:12}}>
            <input className="search-input" type="search" placeholder="Search" aria-label="Search" />
            <div className="badge">{new Date().toLocaleDateString()}</div>
            <LoginControls />
          </div>
        </div>
        <div className="toolbar" style={{justifyContent:'space-between', marginTop:12}}>
          <div className="row" style={{gap:8}}>
            <button className="btn primary" onClick={onLoad} disabled={loading || loaded}>{loaded? 'Données chargées' : (loading ? 'Chargement...' : 'Charger les données')}</button>
            {loaded && <span className="badge">{filteredDevices.length} devices</span>}
          </div>
          <div className="row" style={{gap:8}}>
            {loaded && <ShareLink />}
            {loaded && <button className="btn" onClick={()=>{
              try {
                const layout = localStorage.getItem('home-layout')
                const scene = { name: `Scene ${new Date().toLocaleTimeString()}`, period, room: selectedRoom, group: selectedGroup, layout }
                addScene(scene)
              } catch {}
            }}>★ Save Scene</button>}
            {error && <span className="badge" style={{color:'#ef4444', borderColor:'#ef4444'}}>{error}</span>}
          </div>
        </div>
        {/* Single Routes to avoid dev warnings for unmatched Routes blocks */}
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackView />} />
          {loaded && (
            <>
              <Route path="/" element={<RequireRole role="viewer" fallback={<div className="panel">Authentification requise.</div>}><HomePage devices={filteredDevices} /></RequireRole>} />
              <Route path="/devices" element={<RequireRole role="viewer" fallback={<div className="panel">Authentification requise.</div>}><DevicesPage devices={filteredDevices} /></RequireRole>} />
              <Route path="/devices/:id" element={<RequireRole role="viewer" fallback={<div className="panel">Authentification requise.</div>}><DeviceDetail devices={filteredDevices} metrics={metrics} /></RequireRole>} />
              <Route path="/alerts" element={<RequireRole role="analyst" fallback={<div className="panel">Accès réservé (analyst).</div>}><AlertsPage devices={filteredDevices} /></RequireRole>} />
              <Route path="/assets" element={<RequireRole role="viewer" fallback={<div className="panel">Authentification requise.</div>}><AssetsPage devices={filteredDevices} /></RequireRole>} />
              <Route path="/settings" element={<RequireRole role="admin" fallback={<div className="panel">Accès réservé (admin).</div>}><SettingsPage /></RequireRole>} />
              <Route path="/health" element={<RequireRole role="viewer" fallback={<div className="panel">Authentification requise.</div>}><DataHealth /></RequireRole>} />
            </>
          )}
          {/* While not loaded, fallback to home route to avoid unmatched warnings */}
          {!loaded && <Route path="*" element={<Navigate to="/" replace />} />}
          {loaded && <Route path="*" element={<Navigate to="/" replace />} />}
        </Routes>
      </div>
    
    </I18nProvider>
  )
}
