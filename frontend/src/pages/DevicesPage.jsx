import { Link } from 'react-router-dom'
import { useAssets } from '../state/assets.js'
import { useEffect, useMemo, useState } from 'react'
import { useUiStore } from '../state/filters.js'
import { useAlerts } from '../state/alerts.js'
import { prefetchDevices } from '../lib/prefetch.js'
import DeviceSummaryCard from '../components/DeviceSummaryCard.jsx'
import { api } from '../services/api.js'

export default function DevicesPage({ devices }) {
  const { meta } = useAssets()
  const { period, selectedRoom, selectedGroup } = useUiStore()
  const { log } = useAlerts()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('name-asc') // name-asc|name-desc|freshness-desc|freshness-asc|alerts-desc|alerts-asc
  const [groupBy, setGroupBy] = useState('none') // none|room|group
  const [collapsed, setCollapsed] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [freshness, setFreshness] = useState({}) // deviceId -> age ms

  const visible = (devices||[]).filter(d => {
    const m = meta[d.id] || {}
    const group = (m.group || m.floor || '')
    const room = (m.room || d.room || '')
    if (selectedGroup && selectedGroup !== 'all' && group !== selectedGroup) return false
    if (selectedRoom && selectedRoom !== 'all' && room !== selectedRoom) return false
    return true
  })

  const filtered = useMemo(()=>{
    const qq = q.trim().toLowerCase()
    let arr = visible.filter(d => {
      const m = meta[d.id] || {}
      const name = (m.name || d.name || '').toLowerCase()
      const id = (d.id||'').toLowerCase()
      const tags = (m.tags||d.tags||[]).join(' ').toLowerCase()
      return !qq || name.includes(qq) || id.includes(qq) || tags.includes(qq)
    })
    if (sort === 'name-asc') arr.sort((a,b)=> (meta[a.id]?.name||a.name||'').localeCompare(meta[b.id]?.name||b.name||''))
    if (sort === 'name-desc') arr.sort((a,b)=> (meta[b.id]?.name||b.name||'').localeCompare(meta[a.id]?.name||a.name||''))
    if (sort === 'freshness-desc') arr.sort((a,b)=> (freshness[a.id]??Infinity) - (freshness[b.id]??Infinity))
    if (sort === 'freshness-asc') arr.sort((a,b)=> (freshness[b.id]??-1) - (freshness[a.id]??-1))
    if (sort === 'alerts-desc' || sort === 'alerts-asc') {
      const counts = new Map()
      const now = Date.now(); const winMs = 24*60*60*1000
      for (const a of (log||[])) {
        if (!a?.deviceId || !a?.ts) continue
        if ((now - Number(a.ts)) > winMs) continue
        counts.set(a.deviceId, 1 + (counts.get(a.deviceId)||0))
      }
      arr.sort((a,b)=>{
        const ca = counts.get(a.id)||0
        const cb = counts.get(b.id)||0
        return sort==='alerts-desc' ? (cb - ca) : (ca - cb)
      })
    }
    return arr
  }, [visible, q, sort, meta, freshness, log])

  useEffect(()=>{
    if (!filtered || !filtered.length) return
    try { prefetchDevices(filtered, { ms: period.ms }) } catch {}
  }, [filtered, period])

  // Compute per-device freshness via /api/quality (P metric)
  useEffect(()=>{
    let cancel=false
    async function run(){
      try {
        const now = Date.now(); const from = now - period.ms
        const q = new URLSearchParams({ from:String(from), to:String(now), bucketMs:String(60*60*1000) })
        const r = await fetch(api.getBaseUrl() + '/api/quality?' + q.toString())
        if (!r.ok) return
        const p = await r.json()
        const m = {}
        for (const it of (p.items||[])) {
          if (it.metricKey !== 'P') continue
          const id = it.deviceId; const age = it.freshnessMs
          if (id) m[id] = age
        }
        if (!cancel) setFreshness(m)
      } catch {}
    }
    run(); return ()=>{ cancel=true }
  }, [period])

  // Grouping & pagination
  const grouped = useMemo(()=>{
    if (groupBy==='none') return { '(all)': filtered }
    const map = new Map()
    for (const d of filtered) {
      const m = meta[d.id] || {}
      const key = groupBy==='room' ? (m.room || d.room || '—') : ((m.group || m.floor || '—'))
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(d)
    }
    return Object.fromEntries(map)
  }, [filtered, groupBy, meta])
  const groupKeys = useMemo(()=> Object.keys(grouped), [grouped])
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const pageItems = useMemo(()=>{
    const start = (page-1)*pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  function toggleGroup(key){ setCollapsed(prev => ({ ...prev, [key]: !prev[key] })) }

  return ( 
    <div className="panel">
      <div className="panel-title">Devices</div>
      <div className="row" style={{gap:8, marginBottom:12, flexWrap:'wrap'}}>
        <input className="input" placeholder="Search name, id, tags" value={q} onChange={(e)=>setQ(e.target.value)} />
        <select className="select" value={sort} onChange={(e)=>setSort(e.target.value)}>
          <option value="name-asc">Name ↑</option>
          <option value="name-desc">Name ↓</option>
          <option value="freshness-desc">Freshness (newest)</option>
          <option value="freshness-asc">Freshness (oldest)</option>
          <option value="alerts-desc">Alerts (desc)</option>
          <option value="alerts-asc">Alerts (asc)</option>
        </select>
        <label className="row" style={{gap:6}}>
          Group by
          <select className="select" value={groupBy} onChange={(e)=>setGroupBy(e.target.value)}>
            <option value="none">(none)</option>
            <option value="room">Room</option>
            <option value="group">Group</option>
          </select>
        </label>
        {groupBy==='none' && (
          <label className="row" style={{gap:6}}>
            Page size
            <select className="select" value={pageSize} onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1) }}>
              {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      {groupBy!=='none' && groupKeys.map(key => (
        <div key={key} className="panel" style={{marginTop:12}}>
          <div className="panel-header">
            <div className="panel-title">{key} <span className="badge">{(grouped[key]||[]).length}</span></div>
            <button className="btn" onClick={()=>toggleGroup(key)}>{collapsed[key] ? 'Expand' : 'Collapse'}</button>
          </div>
          {!collapsed[key] && (
            <div style={{display:'grid', gridTemplateColumns:'1fr', gap:20}}>
              {(grouped[key]||[]).map(d => (<DeviceSummaryCard key={d.id} device={d} />))}
            </div>
          )}
        </div>
      ))}

      {groupBy==='none' && (
        <>
          <div style={{display:'grid', gridTemplateColumns:'1fr', gap:20}}>
            {pageItems.map(d => (
              <DeviceSummaryCard key={d.id} device={d} />
            ))}
          </div>
          <div className="row" style={{justifyContent:'space-between', marginTop:12}}>
            <div className="badge">{totalItems} items • page {page}/{totalPages}</div>
            <div className="row" style={{gap:8}}>
              <button className="btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</button>
              <button className="btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
