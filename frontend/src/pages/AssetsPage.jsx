import { useEffect, useMemo, useState } from 'react'
import { useAssets } from '../state/assets.js'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { useAuth } from '../components/AuthProvider.jsx'

export default function AssetsPage({ devices }) {
  const { meta, setMeta } = useAssets()
  const { anchorNow } = useUiStore()
  const [last, setLast] = useState({}) // deviceId -> { ts, U, I, P, temp }
  const [newDev, setNewDev] = useState({ id:'', name:'', room:'', tags:'', description:'' })
  const { hasRole } = useAuth()
  const canEdit = hasRole('analyst') || hasRole('admin')
  const [search, setSearch] = useState('')
  const [fGroup, setFGroup] = useState('all')
  const [fRoom, setFRoom] = useState('all')
  const [fTag, setFTag] = useState('all')
  const [sortBy, setSortBy] = useState('name') // name|last|P|temp

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

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Assets & Groups</div>
      </div>
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
      </div>
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
    </div>
  )
}
