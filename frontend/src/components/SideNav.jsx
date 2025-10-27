import { NavLink } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { useScenes } from '../state/scenes.js'

export default function SideNav() {
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sidebar-open')||'true') } catch { return true }
  })
  useEffect(()=>{ try { localStorage.setItem('sidebar-open', JSON.stringify(open)) } catch {} }, [open])
  useEffect(()=>{
    const on = () => {
      if (window.innerWidth < 768) setOpen(false)
    }
    on(); window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const link = ({ isActive }) => ({
    color:'#c7d2fe', textDecoration:'none', display:'block', padding:'10px 12px', borderRadius:8, background: isActive? 'rgba(99,102,241,0.2)' : 'transparent'
  })

  // Rooms selector (global filter)
  const { devices, selectedRoom, setFilters } = useUiStore()
  const { selectedGroup } = useUiStore()
  const { items: scenes } = useScenes() 
  const { meta } = useAssets()
  const groups = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices||[]) {
      const m = meta[d.id] || {}
      const g = (m.group || m.floor || '').trim()
      if (g) set.add(g)
    }
    return Array.from(set)
  }, [devices, meta])

  const rooms = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices||[]) {
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

  // Persist selections
  useEffect(()=>{
    try { localStorage.setItem('selectedRoom', selectedRoom || 'all') } catch {}
  }, [selectedRoom])
  useEffect(()=>{
    try { localStorage.setItem('selectedGroup', selectedGroup || 'all') } catch {}
  }, [selectedGroup])
  useEffect(()=>{
    try {
      const r = localStorage.getItem('selectedRoom') || 'all'
      const g = localStorage.getItem('selectedGroup') || 'all'
      setFilters({ selectedRoom: r, selectedGroup: g })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <aside className={open? 'sidenav open' : 'sidenav'}>
      <div className="sidenav-header">
        <button className="hamburger" onClick={()=>setOpen(!open)} aria-label="Toggle menu">
          <span/><span/><span/>
        </button>
        {open && <div className="brand">Fusion Smart</div>}
      </div>
      {open && (
        <nav className="sidenav-nav">
          <NavLink to="/" style={link}>Dashboard</NavLink>
          <NavLink to="/devices" style={link}>Devices</NavLink>
          <NavLink to="/alerts" style={link}>Alerts</NavLink>
          <NavLink to="/assets" style={link}>Assets</NavLink>
          <NavLink to="/health" style={link}>Data Health</NavLink>
          <NavLink to="/settings" style={link}>Settings</NavLink>
        </nav>
      )}
      {open && (
        <div style={{ padding: 12 }}>
          {scenes.length>0 && (
            <>
              <div style={{ color:'#c7d2fe', fontSize:12, marginBottom:6 }}>Scenes</div>
              <select className="select" style={{ width:'100%', marginBottom:8 }} onChange={(e)=>{
                const id = e.target.value
                const sc = scenes.find(s=>s.id===id)
                if (!sc) return
                try { if (sc.layout) localStorage.setItem('home-layout', sc.layout) } catch {}
                setFilters({ period: sc.period || undefined, selectedGroup: sc.group || 'all', selectedRoom: sc.room || 'all', anchorNow: Date.now() })
              }}>
                <option value="">Select a scene…</option>
                {scenes.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
          <div style={{ color:'#c7d2fe', fontSize:12, marginBottom:6 }}>Group</div>
          <select className="select" style={{ width:'100%', marginBottom:8 }} value={selectedGroup || 'all'} onChange={(e)=>setFilters({ selectedGroup: e.target.value })}>
            {groups.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ color:'#c7d2fe', fontSize:12, marginBottom:6 }}>Room</div>
          <select className="select" style={{ width:'100%' }} value={selectedRoom || 'all'} onChange={(e)=>setFilters({ selectedRoom: e.target.value })}>
            {rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
    </aside>
  )
}
