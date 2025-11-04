import { useEffect, useMemo, useState } from 'react'
import { useAssets } from '../state/assets.js'
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
  const [pageSize, setPageSize] = useState(10)  // par défaut 10 lignes
  const [freshness, setFreshness] = useState({}) // deviceId -> age ms

  // Filtrage par filtres globaux
  const visible = (devices||[]).filter(d => {
    const m = meta[d.id] || {}
    const group = (m.group || m.floor || '')
    const room  = (m.room  || d.room  || '')
    if (selectedGroup && selectedGroup !== 'all' && group !== selectedGroup) return false
    if (selectedRoom  && selectedRoom  !== 'all' && room  !== selectedRoom ) return false
    return true
  })

  // Recherche + tri
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let arr = visible.filter(d => {
      const m = meta[d.id] || {}
      const name = (m.name || d.name || '').toLowerCase()
      const id   = (d.id||'').toLowerCase()
      const tags = (m.tags||d.tags||[]).join(' ').toLowerCase()
      return !qq || name.includes(qq) || id.includes(qq) || tags.includes(qq)
    })
    if (sort === 'name-asc')  arr.sort((a,b)=> (meta[a.id]?.name||a.name||'').localeCompare(meta[b.id]?.name||b.name||''))
    if (sort === 'name-desc') arr.sort((a,b)=> (meta[b.id]?.name||b.name||'').localeCompare(meta[a.id]?.name||a.name||''))
    if (sort === 'freshness-desc') arr.sort((a,b)=> (freshness[a.id]??Infinity) - (freshness[b.id]??Infinity))
    if (sort === 'freshness-asc')  arr.sort((a,b)=> (freshness[b.id]??-1) - (freshness[a.id]??-1))
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

  // Prefetch
  useEffect(() => {
    if (!filtered || !filtered.length) return
    try { prefetchDevices(filtered, { ms: period.ms }) } catch {}
  }, [filtered, period])

  // Fraîcheur via /api/quality (metric P)
  useEffect(() => {
    let cancel=false
    async function run(){
      try {
        const now = Date.now(); const from = now - period.ms
        const p = await api.quality({ from, to: now, bucketMs: 60*60*1000 })
        const m = {}
        for (const it of (p?.items||[])) {
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
  const grouped = useMemo(() => {
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

  const groupKeys  = useMemo(()=> Object.keys(grouped), [grouped])
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  function toggleGroup(key){ setCollapsed(prev => ({ ...prev, [key]: !prev[key] })) }

  // Rendu de cartes: LISTE (1 par ligne)
  function renderCards(list) {
    if (!list || list.length === 0) {
      return <div className="badge">{q ? `No results for “${q}”` : 'No devices'}</div>
    }
    return (
      <div className="devices-list">
        {list.map(d => <DeviceSummaryCard key={d.id} device={d} />)}
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="card-head" style={{border:'1px solid #e5e7eb', borderRadius:14, marginBottom:12}}>
        <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap', width:'100%'}}>
          <h2 className="card-title" style={{fontSize:18, margin:0, flex:1}}>Devices</h2>
          <input
            className="ghost-input"
            placeholder="Search name, id, tags"
            value={q}
            onChange={(e)=>{ setQ(e.target.value); setPage(1) }}
            style={{ width: 260 }}
          />
          <button className="btn" onClick={()=>{ setQ(''); setPage(1) }} title="Reset search">Reset</button>
          <select className="ghost-input" value={sort} onChange={(e)=>setSort(e.target.value)}>
            <option value="name-asc">Name ↑</option>
            <option value="name-desc">Name ↓</option>
            <option value="freshness-desc">Freshness (newest)</option>
            <option value="freshness-asc">Freshness (oldest)</option>
            <option value="alerts-desc">Alerts (desc)</option>
            <option value="alerts-asc">Alerts (asc)</option>
          </select>
          <label className="row" style={{gap:6, alignItems:'center'}}>
            Group by
            <select className="ghost-input" value={groupBy} onChange={(e)=>{ setGroupBy(e.target.value); setPage(1) }}>
              <option value="none">(none)</option>
              <option value="room">Room</option>
              <option value="group">Group</option>
            </select>
          </label>
          {groupBy==='none' && (
            <label className="row" style={{gap:6, alignItems:'center'}}>
              Page size
              <select
                className="ghost-input"
                value={pageSize}
                onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1) }}
              >
                {[10,15,20,30,50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Vue groupée */}
      {groupBy!=='none' && groupKeys.map(key => (
        <div key={key} className="card-v2" style={{marginTop:12}}>
          <div className="card-head">
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <span className="card-title">{key}</span>
              <span className="badge">{(grouped[key]||[]).length}</span>
            </div>
            <button className="btn" onClick={()=>toggleGroup(key)}>{collapsed[key] ? 'Expand' : 'Collapse'}</button>
          </div>
          {!collapsed[key] && (
            <div className="card-body" style={{paddingTop:16}}>
              {renderCards(grouped[key] || [])}
            </div>
          )}
        </div>
      ))}

      {/* Vue simple + pagination */}
      {groupBy==='none' && (
        <div className="card-v2" style={{marginTop:12}}>
          <div className="card-head">
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <span className="card-title">All devices</span>
              <span className="badge">{totalItems}</span>
            </div>
            <div className="row" style={{gap:8}}>
              <span className="badge">page {page}/{totalPages}</span>
              <button className="btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</button>
              <button className="btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>Next</button>
            </div>
          </div>
          <div className="card-body" style={{paddingTop:16}}>
            {renderCards(pageItems)}
          </div>
        </div>
      )}
    </>
  )
}
