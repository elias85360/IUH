import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

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
  const { period, anchorNow, devices: storeDevices } = useUiStore()
  const [rows, setRows] = useState([])
  const [bucketMs, setBucketMs] = useState(60*60*1000)
  const [metricFilter, setMetricFilter] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')
  const from = useMemo(()=>anchorNow - period.ms, [anchorNow, period])
  const to = useMemo(()=>anchorNow, [anchorNow])

  useEffect(()=>{
    let cancel=false
    async function run(){
      try {
        const q = new URLSearchParams({ from:String(from), to:String(to), bucketMs:String(bucketMs), detail:'1' })
        const r = await fetch(api.getBaseUrl() + '/api/quality?' + q.toString())
        if (r.ok) {
          const p = await r.json()
          if (!cancel) setRows(p.items || [])
        }
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const pct = Math.round((r.completeness||0)*100)
              const freshness = r.freshnessMs
              let cls = 'ok'
              if (freshness != null) {
                if (freshness > 6*60*60*1000) cls = 'crit'
                else if (freshness > 60*60*1000) cls = 'warn'
              }
              return (
                <tr key={r.deviceId + '-' + r.metricKey + '-' + idx}>
                  <td>{r.deviceName || r.deviceId}</td>
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
