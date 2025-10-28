import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

export default function HomeHealthAlerts() {
  const [items, setItems] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){
      try{
        const now = Date.now()
        const from = now - 24*60*60*1000
        const q = new URLSearchParams({ from:String(from), to:String(now), bucketMs:String(60*60*1000) })
        const r = await fetch(api.getBaseUrl() + '/api/quality?' + q.toString())
        if (r.ok){ const p = await r.json(); if(!cancel){ setItems(p.items||[]) } }
      } catch {}
    }
    run(); return ()=>{ cancel=true }
  }, [])
  const worst = (items||[]).slice().sort((a,b)=>{
    const fa = a.freshnessMs||0, fb = b.freshnessMs||0
    const ca = 1-(a.completeness||0), cb = 1-(b.completeness||0)
    return (fb + cb) - (fa + ca)
  }).slice(0,5)
  return (
    <div className="panel">
      <div className="panel-title">Data Health Alerts (Top 5)</div>
      {(!worst||worst.length===0) && <div className="badge">OK</div>}
      {worst.map((r,i)=>{
        const freshness = r.freshnessMs==null? Infinity : r.freshnessMs
        const cls = freshness>6*60*60*1000 ? 'crit' : (freshness>60*60*1000 ? 'warn' : 'ok')
        const pct = Math.round((r.completeness||0)*100)
        return (
          <div key={i} className="row" style={{justifyContent:'space-between'}}>
            <div>{(r.deviceName||r.deviceId)} • {r.metricKey}</div>
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <span className={'status-chip ' + cls}>{freshness===Infinity? '—' : fmtMs(freshness)}</span>
              <span className="badge">{pct}%</span>
              <a className="btn" href={`/devices/${encodeURIComponent(r.deviceId)}?metric=${encodeURIComponent(r.metricKey)}`}>↘</a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function fmtMs(ms){
  if (ms == null) return '—'
  if (ms === Infinity) return '—'
  const s = Math.floor(ms/1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s/60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m/60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h/24)
  return `${d}d`
}

