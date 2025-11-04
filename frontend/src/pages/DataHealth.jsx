import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'

function fmtMs(ms) {
  if (ms == null) return '—'
  const s = Math.floor(ms/1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s/60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m/60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h/24)
  return `${d}d`
}

export default function DataHealth() {
  const { period, anchorNow, devices: storeDevices, excludedDevices, toggleExclude } = useUiStore()
  const { meta, setMeta } = useAssets()
  const [rows, setRows] = useState([])
  const [bucketMs, setBucketMs] = useState(60*60*1000)
  const [metricFilter, setMetricFilter] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [sortMode, setSortMode] = useState('worst') // worst|freshness|completeness
  const from = useMemo(()=>anchorNow - period.ms, [anchorNow, period])
  const to = useMemo(()=>anchorNow, [anchorNow])

  useEffect(()=>{
    let cancel=false
    async function run(){
      try {
        const payload = await api.quality({ from, to, bucketMs, detail: '1' })
        if (!cancel && payload && Array.isArray(payload.items)) setRows(payload.items)
      } catch {}
    }
    run(); return ()=>{ cancel=true }
  }, [from, to, bucketMs])

  const metrics = useMemo(()=>Array.from(new Set(rows.map(r=>r.metricKey))), [rows])
  const devices = useMemo(()=>{
    const map = new Map()
    for (const d of (storeDevices||[])) map.set(d.id, d.name)
    for (const r of rows) if (!map.has(r.deviceId)) map.set(r.deviceId, r.deviceName||r.deviceId)
    return Array.from(map.entries()).map(([id,name])=>({id,name}))
  }, [rows, storeDevices])

  const filtered = useMemo(()=> rows.filter(r => (!metricFilter || r.metricKey===metricFilter) && (!deviceFilter || r.deviceId===deviceFilter)), [rows, metricFilter, deviceFilter])

  const sorted = useMemo(()=>{
    const arr = filtered.slice()
    if (sortMode === 'freshness') {
      arr.sort((a,b)=> (b.freshnessMs||0) - (a.freshnessMs||0))
    } else if (sortMode === 'completeness') {
      arr.sort((a,b)=> (a.completeness||0) - (b.completeness||0))
    } else {
      // worst-first: combine freshness and incompleteness
      const score = (r) => (r.freshnessMs==null? 1e12 : r.freshnessMs) + (1 - (r.completeness||0)) * 1e9
      arr.sort((a,b)=> score(b) - score(a))
    }
    return arr
  }, [filtered, sortMode])

  const freshnessAlerts = useMemo(()=> filtered
    .map(r => ({
      ...r,
      level: r.freshnessMs==null? 'crit' : (r.freshnessMs>6*60*60*1000? 'crit' : (r.freshnessMs>60*60*1000? 'warn' : 'ok'))
    }))
    .filter(r => r.level!=='ok')
    .sort((a,b)=> (b.freshnessMs||0) - (a.freshnessMs||0))
  , [filtered])

  return (
    <div className="panel">
      <div className="panel-title">Santé des données</div>
      <div className="row" style={{gap:8, margin:'8px 0'}}>
        <button className="btn" onClick={()=>{
          try {
            const header = ['deviceId','deviceName','metricKey','unit','lastTs','freshnessMs','completeness','gaps']
            const lines = [header.join(',')]
            for (const r of filtered) {
              lines.push([r.deviceId, JSON.stringify(r.deviceName||''), r.metricKey, r.unit||'', r.lastTs||'', r.freshnessMs||'', r.completeness||'', r.gaps||''].join(','))
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'data_health.csv'; a.click(); URL.revokeObjectURL(url)
          } catch {}
        }}>Export CSV</button>
        <button className="btn" onClick={()=>{
          try {
            const payload = { from, to, bucketMs, items: filtered }
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' }); const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'data_health.json'; a.click(); URL.revokeObjectURL(url)
          } catch {}
        }}>Export JSON</button>
      </div>
      <div className="row" style={{gap:12, marginBottom:12, flexWrap:'wrap'}}>
        <label className="row" style={{gap:6}}>
          Bucket
          <select className="select" value={bucketMs} onChange={(e)=>setBucketMs(Number(e.target.value))}>
            <option value={3600000}>1h</option>
            <option value={21600000}>6h</option>
            <option value={86400000}>1j</option>
          </select>
        </label>
        <span className="badge">Période: {new Date(from).toLocaleString()} → {new Date(to).toLocaleString()}</span>
        <label className="row" style={{gap:6}}>
          Sort
          <select className="select" value={sortMode} onChange={(e)=>setSortMode(e.target.value)}>
            <option value="worst">Worst first</option>
            <option value="freshness">By freshness</option>
            <option value="completeness">By completeness</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Metric
          <select className="select" value={metricFilter} onChange={(e)=>setMetricFilter(e.target.value)}>
            <option value="">(all)</option>
            {metrics.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Device
          <select className="select" value={deviceFilter} onChange={(e)=>setDeviceFilter(e.target.value)}>
            <option value="">(all)</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      {freshnessAlerts.length>0 && (
        <div className="panel" style={{marginBottom:12}}>
          <div className="panel-title">Alertes de fraîcheur</div>
          {freshnessAlerts.slice(0,10).map((r,idx)=>{
            const cls = r.level
            return (
              <div key={r.deviceId + '-' + r.metricKey + '-' + idx} className="row" style={{justifyContent:'space-between'}}>
                <div>{(r.deviceName || r.deviceId) + ' • ' + r.metricKey}</div>
                <div><span className={'status-chip ' + cls}>{fmtMs(r.freshnessMs)}</span></div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{overflowX:'auto'}}>
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Metric</th>
              <th>Dernier point</th>
              <th>Fraîcheur</th>
              <th>Complétude</th>
              <th>Gaps</th>
              <th>Exclude</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const pct = Math.round((r.completeness||0)*100)
              const freshness = r.freshnessMs
              let cls = 'ok'
              if (freshness != null) {
                if (freshness > 6*60*60*1000) cls = 'crit'
                else if (freshness > 60*60*1000) cls = 'warn'
              }
              const isExcluded = !!meta[r.deviceId]?.exclude || (excludedDevices||[]).includes(r.deviceId)
              return (
                <tr key={r.deviceId + '-' + r.metricKey + '-' + idx}>
                  <td><a className="link" href={`/devices/${encodeURIComponent(r.deviceId)}?metric=${encodeURIComponent(r.metricKey)}`}>{r.deviceName || r.deviceId}</a></td>
                  <td>{r.metricKey} {r.unit? '(' + r.unit + ')' : ''}</td>
                  <td>{r.lastTs? new Date(r.lastTs).toLocaleString() : '—'}</td>
                  <td><span className={'status-chip ' + cls}>{fmtMs(freshness)}</span></td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div style={{width:120, height:8, background:'rgba(255,255,255,0.08)', borderRadius:6, overflow:'hidden'}}>
                        <div style={{width:`${pct}%`, height:'100%', background: pct>95? '#22c55e' : pct>80? '#fbbf24' : '#ef4444'}} />
                      </div>
                      <span>{pct}%</span>
                    </div>
                  </td>
                  <td>{r.gaps}</td>
                  <td>
                    <label className="row" style={{gap:6}}>
                      <input type="checkbox" checked={isExcluded} onChange={async (e)=>{
                        const v = e.target.checked
                        try {
                          toggleExclude(r.deviceId)
                          await api.putAssetsMeta({ [r.deviceId]: { exclude: v } }, false)
                          // optimistic update in assets store
                          setMeta(r.deviceId, { exclude: v })
                        } catch {}
                      }} /> Exclude from dashboards
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {bucketMs === 3600000 && filtered.length>0 && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">Heatmap de complétude (heures × jours)</div>
          <CompletenessHeatmap rows={filtered} from={from} to={to} />
        </div>
      )}
    </div>
  )
}

function CompletenessHeatmap({ rows, from, to }) {
  const [idx, setIdx] = useState(0)
  const row = rows[Math.min(idx, rows.length-1)] || rows[0]
  const days = useMemo(()=>{
    const arr = []
    const start = new Date(new Date(from).toDateString()).getTime()
    for (let t = start; t <= to; t += 24*60*60*1000) arr.push(t)
    return arr
  }, [from, to])
  const labels = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
  const present = new Set((row.presentBuckets||[]).map(Number))
  return (
    <div>
      <div className="row" style={{gap:8, marginBottom:8}}>
        <span className="badge">{(row.deviceName || row.deviceId) + ' • ' + row.metricKey}</span>
        <select className="select" value={idx} onChange={(e)=>setIdx(Number(e.target.value))}>
          {rows.map((r,i)=>(<option key={r.deviceId + '-' + r.metricKey + '-' + i} value={i}>{(r.deviceName||r.deviceId) + ' • ' + r.metricKey}</option>))}
        </select>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(25, 1fr)', gap:2}}>
        <div></div>
        {Array.from({length:24},(_,h)=>(<div key={'h'+h} style={{fontSize:10, textAlign:'center'}}>{h}</div>))}
        {days.map((dayTs, di)=> (
          <>
            <div key={'dlabel-'+di} style={{fontSize:10}}>{labels[new Date(dayTs).getDay()]}</div>
            {Array.from({length:24},(_,h)=>{
              const ts = dayTs + h*60*60*1000
              const ok = present.has(ts)
              const bg = ok ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.4)'
              return <div key={'c'+di+'-'+h} title={(new Date(ts).toLocaleString()) + ' • ' + (ok?'present':'missing')} style={{height:18, background:bg, border:'1px solid rgba(255,255,255,0.08)'}} />
            })}
          </>
        ))}
      </div>
    </div>
  )
}
