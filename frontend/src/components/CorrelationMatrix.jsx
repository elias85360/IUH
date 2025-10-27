import React, { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

const METRICS = ['U','I','P','temp','humid','pf']

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  let sx=0, sy=0, sxx=0, syy=0, sxy=0, k=0
  for (let i=0;i<n;i++) {
    const x=Number(xs[i]); const y=Number(ys[i])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    k++; sx+=x; sy+=y; sxx+=x*x; syy+=y*y; sxy+=x*y
  }
  if (k<2) return 0
  const cov = (sxy - sx*sy/k)/(k-1)
  const vx = (sxx - sx*sx/k)/(k-1) || 1e-9
  const vy = (syy - sy*sy/k)/(k-1) || 1e-9
  return cov / Math.sqrt(vx*vy)
} 

export default function CorrelationMatrix({ deviceId, devices }) {
  const { anchorNow, period } = useUiStore()
  const [matrix, setMatrix] = useState([])
  const [labels, setLabels] = useState(METRICS)
  const id = deviceId || (devices && devices[0] && devices[0].id)

  useEffect(()=>{
    let cancel=false
    async function run(){
      if (!id) return
      const from = anchorNow - Math.min(period.ms, 7*24*60*60*1000)
      const to = anchorNow
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/120))
      const series = {}
      for (const m of METRICS) {
        const r = await api.timeseries(id, m, { from, to, bucketMs })
        series[m] = (r.points||[]).map(p=>Number(p.value)).filter(Number.isFinite)
      }
      const mat = METRICS.map(a => METRICS.map(b => pearson(series[a]||[], series[b]||[])))
      if (!cancel) { setMatrix(mat); setLabels(METRICS) }
    }
    run(); return ()=>{ cancel=true }
  }, [id, anchorNow, period])

  // Diverging color palette: red for positive correlations, blue for negative correlations
  const color = (v) => {
    const r = Math.max(-1, Math.min(1, v))
    const red = r > 0 ? Math.floor(255 * r) : 0
    const blue = r < 0 ? Math.floor(255 * (-r)) : 0
    // Constant green channel for midtones
    const green = 50
    return `rgba(${red}, ${green}, ${blue}, 0.5)`
  }

  // Compute global min and max correlation values for badges
  const flat = matrix.flat()
  const minCorr = flat.length ? Math.min(...flat) : 0
  const maxCorr = flat.length ? Math.max(...flat) : 0

  return (
    <div className="panel">
      <div className="panel-title" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span>Correlation Matrix</span>
        <span style={{display:'flex', gap:8}}>
          <span className="badge">Min {minCorr.toFixed(2)}</span>
          <span className="badge">Max {maxCorr.toFixed(2)}</span>
        </span>
      </div>
      <div style={{display:'grid', gridTemplateColumns: `repeat(${labels.length+1}, 1fr)`, gap:4}}>
        <div></div>
        {labels.map(l=><div key={`h-${l}`} style={{fontSize:11,textAlign:'center'}}>{l}</div>)}
        {matrix.map((row,i)=> (
          <React.Fragment key={`row-${i}`}>
            <div key={`rlabel-${i}`} style={{fontSize:11}}>{labels[i]}</div>
            {row.map((v,j)=> (
              <div key={`c-${i}-${j}`} title={v.toFixed(2)} style={{height:18, background:color(v), border:'1px solid rgba(255,255,255,0.08)', textAlign:'center', fontSize:10}}>{v.toFixed(2)}</div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
