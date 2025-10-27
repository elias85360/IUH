import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

export default function TopBottom({ devices=[], metric='P', period }) {
  const from = useMemo(()=>Date.now()-period.ms,[period])
  const to = useMemo(()=>Date.now(),[period])
  const [rows, setRows] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run() {
      const out = []
      for (const d of devices) {
        try {
          const r = await api.kpis(d.id, from, to)
          const v = r && r.kpis && r.kpis[metric] ? Number(r.kpis[metric].avg) : NaN
          if (!Number.isNaN(v)) out.push({ id: d.id, name: d.name, avg: v })
        } catch {}
      }
      out.sort((a,b)=>b.avg-a.avg)
      if (!cancel) setRows(out)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, metric, from, to])

  const top5 = rows.slice(0,5)
  const bottom5 = rows.slice(-5).reverse()

  return (
    <div className="panel">
      <div className="panel-title">Top/Bottom (avg {metric})</div>
      <div className="row" style={{gap:24}}>
        <div style={{flex:1}}>
          <div className="badge">Top 5</div>
          {top5.map(r => (
            <div key={r.id} className="row" style={{justifyContent:'space-between'}}>
              <div>{r.name}</div>
              <div><strong>{Math.round(r.avg)}</strong></div>
            </div>
          ))}
        </div>
        <div style={{flex:1}}>
          <div className="badge">Bottom 5</div>
          {bottom5.map(r => (
            <div key={r.id} className="row" style={{justifyContent:'space-between'}}>
              <div>{r.name}</div>
              <div><strong>{Math.round(r.avg)}</strong></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

