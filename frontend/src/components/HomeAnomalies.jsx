import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { robustZ } from '../lib/statsRobust.js'

export default function HomeAnomalies({ devices = [], topN = 8 }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){
      const out = []
      const bucketMs = Math.max(60*1000, Math.floor((to-from)/200))
      for (const d of devices) {
        try {
          const r = await api.timeseries(d.id, 'P', { from, to, bucketMs })
          const pts = (r.points||[]).map(p => ({ ts: Number(p.ts), value: Number(p.value) })).filter(p => Number.isFinite(p.ts) && Number.isFinite(p.value))
          if (!pts.length) continue
          const zs = robustZ(pts.map(p=>p.value))
          for (let i=0;i<pts.length;i++) {
            const z = zs[i]?.z
            if (!Number.isFinite(z)) continue
            out.push({ deviceId: d.id, deviceName: d.name, ts: pts[i].ts, value: pts[i].value, z })
          }
        } catch {}
      }
      if (!cancel) setRows(out)
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  const top = useMemo(()=> rows.slice().sort((a,b)=> Math.abs(b.z) - Math.abs(a.z)).slice(0, topN), [rows, topN])

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Anomalies (Top {topN})</div>
      </div>
      {(!top || top.length===0) && <div className="badge">No anomalies</div>}
      <div style={{maxHeight:220, overflowY:'auto'}}>
        {top.map((a,i)=> (
          <div key={i} className="row" style={{justifyContent:'space-between'}}>
            <div>{a.deviceName || a.deviceId}</div>
            <div>{new Date(a.ts).toLocaleString()}</div>
            <div><strong>{Number(a.value).toFixed?.(1)}</strong></div>
            <div className="badge" style={{borderColor:'#ef4444', color:'#ef4444'}}>z={Number(a.z).toFixed?.(2)}</div>
            <a className="btn" href={`/devices/${encodeURIComponent(a.deviceId)}?metric=P`}>↘</a>
          </div>
        ))}
      </div>
    </div>
  )
}

