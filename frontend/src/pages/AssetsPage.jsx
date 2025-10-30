import { useEffect, useMemo, useState } from 'react'
import { useAssets } from '../state/assets.js'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { useAuth } from '../components/AuthProvider.jsx'
import FloorPlanEditor from '../components/FloorPlanEditor.jsx'
import { formatValue, unitForMetric } from '../lib/format.js'

export default function AssetsPage({ devices }) {
  const { meta, setMeta } = useAssets()
  const { anchorNow } = useUiStore()
  const [last, setLast] = useState({}) // deviceId -> { ts, U, I, P, temp }
  const [newDev, setNewDev] = useState({ id:'', name:'', room:'', tags:'', description:'' })
  const { hasRole } = useAuth()
  const canEdit = hasRole('analyst') || hasRole('admin')
  const [tab, setTab] = useState('list') // list|plan
  const [search, setSearch] = useState('')
  const [fGroup, setFGroup] = useState('all')
  const [fRoom, setFRoom] = useState('all')
  const [fTag, setFTag] = useState('all')
  const [sortBy, setSortBy] = useState('name') // name|last|P|temp
  const [busySuggest, setBusySuggest] = useState(false)

  useEffect(()=>{
    let cancel=false
    async function run(){ 
      const now = anchorNow
      const from = now - 2*60*60*1000
      const out={}
      for (const d of devices) {
        const [U,I,P,temp] = await Promise.all([
          api.timeseries(d.id,'U',{from,to:now,length:5}),
          api.timeseries(d.id,'I',{from,to:now,length:5}),
          api.timeseries(d.id,'P',{from,to:now,length:5}),
          api.timeseries(d.id,'temp',{from,to:now,length:5}),
        ])
        const pick = (r)=>{ const pts=r.points||[]; return pts.length? pts[pts.length-1]: null }
        out[d.id] = {
          ts: pick(U)?.ts || pick(I)?.ts || pick(P)?.ts || pick(temp)?.ts,
          U: pick(U)?.value, I: pick(I)?.value, P: pick(P)?.value, temp: pick(temp)?.value,
        }
      }
      if (!cancel) setLast(out)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, anchorNow])

  // Try to sync meta from backend on mount (if available)
  useEffect(()=>{ (async()=>{ try{ const r=await api.getAssetsMeta(); const m=r.meta||{}; for(const [id,v] of Object.entries(m)) setMeta(id,v) }catch{} })() }, [])

  const groups = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices) { const m = meta[d.id]||{}; const g=(m.group||m.floor||'').trim(); if (g) set.add(g) }
    return Array.from(set)
  }, [devices, meta])
  const rooms = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices) { const m = meta[d.id]||{}; const r=(m.room||d.room||'').trim(); if (r) set.add(r) }
    return Array.from(set)
  }, [devices, meta])
  const tagsList = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices) { const m = meta[d.id]||{}; for (const t of (m.tags||d.tags||[])) if (t) set.add(t) }
    return Array.from(set)
  }, [devices, meta])

  const filtered = useMemo(()=>{
    return devices.filter(d => {
      const m = meta[d.id]||{}
      const q = search.trim().toLowerCase()
      const idok = !q || d.id.toLowerCase().includes(q) || (m.name||d.name||'').toLowerCase().includes(q)
      if (!idok) return false
      const g = (m.group||m.floor||'all')
      const r = (m.room||d.room||'all')
      const tags = (m.tags||d.tags||[])
      if (fGroup!=='all' && g!==fGroup) return false
      if (fRoom!=='all' && r!==fRoom) return false
      if (fTag!=='all' && !tags.includes(fTag)) return false
      return true
    }).sort((a,b)=>{
      const la = last[a.id]||{}, lb = last[b.id]||{}
      if (sortBy==='last') return (lb.ts||0)-(la.ts||0)
      if (sortBy==='P') return (lb.P||0)-(la.P||0)
      if (sortBy==='temp') return (lb.temp||0)-(la.temp||0)
      const na = (meta[a.id]?.name||a.name||'').toLowerCase(); const nb = (meta[b.id]?.name||b.name||'').toLowerCase();
      return na.localeCompare(nb)
    })
  }, [devices, meta, last, search, fGroup, fRoom, fTag, sortBy])

  function freshnessChip(ts){
    if (!ts) return <span className="status-chip crit">—</span>
    const age = Date.now()-Number(ts)
    const cls = age>6*60*60*1000? 'crit' : age>60*60*1000? 'warn' : 'ok'
    return <span className={`status-chip ${cls}`}>{new Date(ts).toLocaleTimeString()}</span>
  }

  async function saveMetaToServer() {
    try {
      const updates = {}
      for (const d of devices) {
        const m = meta[d.id] || {}
        const entry = {}
        if (m.name) entry.name = m.name
        if (m.group || m.floor) entry.group = m.group || m.floor
        if (m.room) entry.room = m.room
        if (Array.isArray(m.tags)) entry.tags = m.tags
        if (m.description) entry.description = m.description
        if (m.pos) entry.pos = m.pos
        if (Object.keys(entry).length) updates[d.id] = entry
      }
      await api.putAssetsMeta(updates, false)
      alert('Assets metadata saved')
    } catch { alert('Save failed') }
  }

  function exportMetaCsv() {
    try {
      const header = ['id','name','group','room','tags','description','posX','posY','exclude']
      const lines = [header.join(',')]
      for (const d of devices) {
        const m = meta[d.id] || {}
        const tags = (m.tags||[]).join('|')
        const posX = m.pos?.xPct != null ? m.pos.xPct : ''
        const posY = m.pos?.yPct != null ? m.pos.yPct : ''
        const exclude = m.exclude ? '1' : ''
        lines.push([d.id, JSON.stringify(m.name||''), JSON.stringify(m.group||m.floor||''), JSON.stringify(m.room||''), JSON.stringify(tags), JSON.stringify(m.description||''), posX, posY, exclude].join(','))
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'assets_meta.csv'; a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  async function suggestDescriptions() {
    if (!canEdit) return
    const overwrite = window.confirm('Remplir automatiquement les descriptions à partir des métriques observées ?\nOK = écraser les descriptions existantes, Annuler = ne remplir que les vides.')
    setBusySuggest(true)
    try {
      let deadband = ''
      try { const s = await api.getThresholds(); deadband = (s?.options?.deadbandPct != null) ? `${s.options.deadbandPct}%` : '' } catch {}
      const now = Date.now()
      const from = now - 7*24*60*60*1000
      for (const d of devices) {
        const m = meta[d.id] || {}
        if (m.description && !overwrite) continue
        let metricsList = []
        try { const r = await api.metrics(d.id); metricsList = (r.metrics||[]).map(x=>x.key||x) } catch {}
        let k = {}
        try { const r = await api.kpis(d.id, from, now); k = r.kpis || r } catch {}
        const parts = []
        if (metricsList.includes('P') && k.P) parts.push(`P moy ${formatValue('P', k.P.avg)}, max ${formatValue('P', k.P.max)}`)
        if (metricsList.includes('U') && k.U) parts.push(`U moy ${formatValue('U', k.U.avg)}, min ${formatValue('U', k.U.min)}, max ${formatValue('U', k.U.max)}`)
        if (metricsList.includes('I') && k.I) parts.push(`I moy ${formatValue('I', k.I.avg)}, max ${formatValue('I', k.I.max)}`)
        if (metricsList.includes('F') && k.F) parts.push(`F moy ${formatValue('F', k.F.avg)}`)
        if (metricsList.includes('pf') && k.pf) parts.push(`pf moy ${Number(k.pf.avg).toFixed(2)}`)
        if (metricsList.includes('temp') && k.temp) parts.push(`temp moy ${formatValue('temp', k.temp.avg)}`)
        if (metricsList.includes('humid') && k.humid) parts.push(`humid moy ${formatValue('humid', k.humid.avg)}`)
        const measures = parts.length ? parts.join('; ') : 'Mesures électriques et environnementales'
        const desc = `Appareil: ${m.name || d.name}. Mesures sur 7j: ${measures}. Seuils dans Settings; deadband ${deadband || 'par défaut'}.`
        setMeta(d.id, { description: desc })
      }
      alert('Descriptions proposées. Vérifiez puis cliquez sur "Save meta" pour persister côté serveur.')
    } finally { setBusySuggest(false) }
  }

  function importMetaCsv(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result||'')
        const [first, ...rows] = text.split(/\r?\n/)
        for (const line of rows) {
          if (!line.trim()) continue
          const cols = []
          let cur = ''
          let inq = false
          for (let i=0;i<line.length;i++) {
            const ch = line[i]
            if (ch==='"') { inq = !inq; cur += ch; continue }
            if (ch===',' && !inq) { cols.push(cur); cur=''; continue }
            cur += ch
          }
          cols.push(cur)
          const [id, name, group, room, tags, description, posX, posY, exclude] = cols
          if (!id) continue
          const updates = {}
          if (name) updates.name = JSON.parse(name)
          if (group) updates.group = JSON.parse(group)
          if (room) updates.room = JSON.parse(room)
          if (tags) updates.tags = JSON.parse(tags).split('|').map(s=>s.trim()).filter(Boolean)
          if (description) updates.description = JSON.parse(description)
          const x = Number(posX); const y = Number(posY)
          if (Number.isFinite(x) && Number.isFinite(y)) updates.pos = { xPct: x, yPct: y }
          if (exclude != null && exclude.trim() !== '') updates.exclude = exclude.trim() === '1'
          if (Object.keys(updates).length) setMeta(id, updates)
        }
        alert('CSV imported. Click "Save meta" to persist to server.')
      } catch { alert('CSV import failed') }
    }
    reader.readAsText(file)
  }

  return (
    <div className="panel">
      <div className="panel-header" style={{justifyContent:'space-between'}}>
        <div className="panel-title">Assets & Groups</div>
        <div className="row" style={{gap:8}}>
          <button className={`btn ${tab==='list'?'primary':''}`} onClick={()=>setTab('list')}>List</button>
          <button className={`btn ${tab==='plan'?'primary':''}`} onClick={()=>setTab('plan')}>Floor plan</button>
        </div>
      </div>
      {tab==='plan' && (
        <div className="panel" style={{marginBottom:16}}>
          <div className="panel-title">Floor plan</div>
          <FloorPlanEditor devices={devices} meta={meta} setMeta={setMeta} />
          <div className="row" style={{gap:8, marginTop:12}}>
            <button className="btn" onClick={saveMetaToServer}>Save meta</button>
          </div>
        </div>
      )}
      <div className="row" style={{gap:8, marginBottom:12, flexWrap:'wrap'}}>
        <input className="input" placeholder="Search id/name" style={{width:220}} value={search} onChange={(e)=>setSearch(e.target.value)} />
        <select className="select" value={fGroup} onChange={(e)=>setFGroup(e.target.value)}>
          {groups.map(g=><option key={g} value={g}>{g}</option>)}
        </select>
        <select className="select" value={fRoom} onChange={(e)=>setFRoom(e.target.value)}>
          {rooms.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select" value={fTag} onChange={(e)=>setFTag(e.target.value)}>
          {tagsList.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
          <option value="name">Name</option>
          <option value="last">Last seen</option>
          <option value="P">Power</option>
          <option value="temp">Temp</option>
        </select>
      </div>
      {tab==='list' && (
      <div className="row" style={{gap:8, marginBottom:12}}>
        <input className="input" placeholder="New device id" style={{width:220}} value={newDev.id} onChange={(e)=>setNewDev({...newDev, id:e.target.value})} />
        <input className="input" placeholder="Name" style={{width:160}} value={newDev.name} onChange={(e)=>setNewDev({...newDev, name:e.target.value})} />
        <input className="input" placeholder="Room" style={{width:140}} value={newDev.room} onChange={(e)=>setNewDev({...newDev, room:e.target.value})} />
        <input className="input" placeholder="Tags (comma)" style={{width:200}} value={newDev.tags} onChange={(e)=>setNewDev({...newDev, tags:e.target.value})} />
        <input className="input" placeholder="Description" style={{width:260}} value={newDev.description} onChange={(e)=>setNewDev({...newDev, description:e.target.value})} />
        <button className="btn" onClick={()=>{
          if (!newDev.id) return
          setMeta(newDev.id, { name:newDev.name, room:newDev.room, tags: newDev.tags.split(',').map(s=>s.trim()).filter(Boolean), description: newDev.description })
          setNewDev({ id:'', name:'', room:'', tags:'', description:'' })
        }}>Add/Update</button>
        <span className="badge">Note: pour Kienlab, ajoutez aussi l'ID dans VITE_KIENLAB_DEVICES pour activer les données.</span>
        {canEdit && <button className="btn" disabled={busySuggest} onClick={suggestDescriptions}>{busySuggest? 'Suggesting…' : 'Suggest descriptions'}</button>}
      </div>
      )}
      {tab==='list' && (
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
              <th>Device</th><th>Group</th><th>Room</th><th>Tags</th><th>Description</th><th>U (V)</th><th>I (A)</th><th>P (W)</th><th>Temp (°C)</th><th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const m = meta[d.id] || {}
              const l = last[d.id] || {}
              return (
                <tr key={d.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td>
                    <input className="input" style={{width:200}} defaultValue={m.name||d.name} disabled={!canEdit} onBlur={(e)=>setMeta(d.id,{ name: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" style={{width:140}} defaultValue={m.group||m.floor||''} disabled={!canEdit} onBlur={(e)=>setMeta(d.id,{ group: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" style={{width:160}} defaultValue={m.room||d.room||''} disabled={!canEdit} onBlur={(e)=>setMeta(d.id,{ room: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" style={{width:240}} defaultValue={(m.tags||d.tags||[]).join(',')} disabled={!canEdit} onBlur={(e)=>setMeta(d.id,{ tags: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} />
                  </td>
                  <td>
                    <input className="input" style={{width:300}} defaultValue={m.description||''} disabled={!canEdit} onBlur={(e)=>setMeta(d.id,{ description: e.target.value })} />
                  </td>
                  <td>{l.U?.toFixed?.(2) ?? '—'}</td>
                  <td>{l.I?.toFixed?.(2) ?? '—'}</td>
                  <td>{l.P?.toFixed?.(0) ?? '—'}</td>
                  <td>{l.temp?.toFixed?.(1) ?? '—'}</td>
                  <td>{freshnessChip(l.ts)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
      {tab==='list' && (
        <div className="row" style={{gap:8, marginTop:12}}>
          <button className="btn" onClick={saveMetaToServer}>Save meta</button>
          <button className="btn" onClick={exportMetaCsv}>Export CSV</button>
          <label className="btn" style={{display:'inline-flex', alignItems:'center', gap:8}}>
            Import CSV
            <input type="file" accept=".csv" style={{display:'none'}} onChange={(e)=>{ const f=e.target.files?.[0]; if (f) importMetaCsv(f) }} />
          </label>
        </div>
      )}
    </div>
  )
}
