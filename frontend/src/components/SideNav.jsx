import { NavLink } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { useScenes } from '../state/scenes.js'

export default function SideNav() {
  // Etat ouvert/fermé (persisté)
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-open') || 'true') } catch { return true }
  })
  useEffect(()=>{ try { localStorage.setItem('sidebar-open', JSON.stringify(open)) } catch {} }, [open])
  useEffect(()=>{
    const on = () => { if (window.innerWidth < 768) setOpen(false) }
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Données & filtres globaux
  const { devices, selectedRoom, setFilters } = useUiStore()
  const { selectedGroup } = useUiStore()
  const { items: scenes } = useScenes()
  const { meta } = useAssets()

  // Groupes dérivés depuis les métadonnées
  const groups = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices || []) {
      const m = meta[d.id] || {}
      const g = (m.group || m.floor || '').trim()
      if (g) set.add(g)
    }
    return Array.from(set)
  }, [devices, meta])

  // Rooms filtrées par groupe sélectionné
  const rooms = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices || []) {
      const m = meta[d.id] || {}
      if (selectedGroup && selectedGroup !== 'all') {
        const g = (m.group || m.floor || '').trim()
        if (g !== selectedGroup) continue
      }
      const r = (m.room || d.room || '').trim()
      if (r) set.add(r)
    }
    return Array.from(set)
  }, [devices, meta, selectedGroup])

  // Persistance des sélections
  useEffect(()=>{ try { localStorage.setItem('selectedRoom', selectedRoom || 'all') } catch {} }, [selectedRoom])
  useEffect(()=>{ try { localStorage.setItem('selectedGroup', selectedGroup || 'all') } catch {} }, [selectedGroup])
  useEffect(()=>{
    try {
      const r = localStorage.getItem('selectedRoom') || 'all'
      const g = localStorage.getItem('selectedGroup') || 'all'
      setFilters({ selectedRoom: r, selectedGroup: g })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = [
    { to: '/',        icon: '📊', label: 'Dashboard' },
    { to: '/devices', icon: '📟', label: 'Devices' },
    { to: '/alerts',  icon: '🔔', label: 'Alerts' },
    { to: '/assets',  icon: '🗂', label: 'Assets' },
    { to: '/health',  icon: '❤️‍🩹', label: 'Data Health' },
    { to: '/settings',icon: '⚙️', label: 'Settings' },
  ]

  return (
    <>
      <aside className={open ? 'sidenav-v2 open' : 'sidenav-v2'}>
        {/* Header (bouton + marque) */}
        <div className="header">
          <button className="hamburger" onClick={()=>setOpen(o=>!o)} aria-label="Toggle menu">
          <span/><span/><span/>
        </button>
        {open && <div className="brand">ServerSense ⚡</div>}
      </div>

      {/* Navigation principale */}
      <nav>
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `item${isActive ? ' active' : ''}`
            }
          >
            <span className="icon" aria-hidden="true">{it.icon}</span>
            {open && <span className="label">{it.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Filtres & scènes (affichés seulement quand ouvert) */}
      {open && (
        <div style={{ padding: 12 }}>
          {scenes.length > 0 && (
            <>
              <div style={{ color:'#c7d2fe', fontSize:12, margin:'8px 0 6px' }}>Scenes</div>
              <select
                className="ghost-input"
                style={{ width:'100%', marginBottom:8 }}
                onChange={(e)=>{
                  const id = e.target.value
                  const sc = scenes.find(s=>s.id === id)
                  if (!sc) return
                  try { if (sc.layout) localStorage.setItem('home-layout', sc.layout) } catch {}
                  setFilters({
                    period: sc.period || undefined,
                    selectedGroup: sc.group || 'all',
                    selectedRoom: sc.room || 'all',
                    anchorNow: Date.now()
                  })
                }}
                defaultValue=""
              >
                <option value="">Select a scene…</option>
                {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}

          <div style={{ color:'#c7d2fe', fontSize:12, marginBottom:6 }}>Group</div>
          <select
            className="ghost-input"
            style={{ width:'100%', marginBottom:8 }}
            value={selectedGroup || 'all'}
            onChange={(e)=>setFilters({ selectedGroup: e.target.value })}
          >
            {groups.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <div style={{ color:'#c7d2fe', fontSize:12, marginBottom:6 }}>Room</div>
          <select
            className="ghost-input"
            style={{ width:'100%' }}
            value={selectedRoom || 'all'}
            onChange={(e)=>setFilters({ selectedRoom: e.target.value })}
          >
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {/* Footer compact (version / aide) */}
      {open && (
        <div className="footer">
          <div className="chip" title="App version">
            <span>v1</span>
          </div>
        </div>
      )}
      </aside>
      <button
        type="button"
        className={open ? 'sidenav-overlay show' : 'sidenav-overlay'}
        onClick={()=>setOpen(false)}
        aria-hidden={!open}
        tabIndex={-1}
      />
    </>
  )
}
