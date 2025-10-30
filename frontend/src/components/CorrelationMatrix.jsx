import React, { useEffect, useMemo, useState } from 'react'
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
  const [selected, setSelected] = useState(null) // [i,j]
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

  // Symmetric diverging palette (white at 0, blue for -1, red for +1)
  const color = (v) => {
    const r = Math.max(-1, Math.min(1, Number(v)))
    const t = Math.abs(r)
    const lerp = (a,b,x)=>Math.round(a+(b-a)*x)
    if (r >= 0) {
      // white -> red
      return `rgb(${lerp(248,239,t)}, ${lerp(250,68,t)}, ${lerp(252,68,t)})`
    } else {
      // white -> blue
      return `rgb(${lerp(248,59,t)}, ${lerp(250,130,t)}, ${lerp(252,246,t)})`
    }
  }

  // Compute global min and max correlation values for badges
  const flat = matrix.flat()
  const minCorr = flat.length ? Math.min(...flat) : 0
  const maxCorr = flat.length ? Math.max(...flat) : 0

  // Top correlations (off-diagonal, unique pairs), clickable
  const top = useMemo(()=>{
    const pairs = []
    for (let i=0;i<labels.length;i++) {
      for (let j=i+1;j<labels.length;j++) {
        const v = Number(matrix?.[i]?.[j] ?? 0)
        if (Number.isFinite(v)) pairs.push({ i, j, a: labels[i], b: labels[j], v, abs: Math.abs(v) })
      }
    }
    return pairs.sort((p,q)=>q.abs - p.abs).slice(0,5)
  }, [matrix, labels])

  return (
    <div className="panel">
      <div className="panel-title" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span>Correlation Matrix</span>
        <span style={{display:'flex', gap:8, alignItems:'center'}}>
          <span className="badge">Min {minCorr.toFixed(2)}</span>
          <span className="badge">Max {maxCorr.toFixed(2)}</span>
        </span>
      </div>
      {top && top.length>0 && (
        <div className="row" style={{flexWrap:'wrap', gap:8, margin:'4px 0 10px 0'}}>
          {top.map((t,idx)=> (
            <button key={idx} className="btn" onClick={()=>setSelected([t.i,t.j])} title={`Corr(${t.a},${t.b})=${t.v.toFixed(2)}`}>
              {t.a}↔{t.b} <span className="badge" style={{marginLeft:6}}>{t.v.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{display:'grid', gridTemplateColumns: `repeat(${labels.length+1}, 1fr)`, gap:4}}>
        <div></div>
        {labels.map(l=><div key={`h-${l}`} style={{fontSize:11,textAlign:'center'}}>{l}</div>)}
        {matrix.map((row,i)=> (
          <React.Fragment key={`row-${i}`}>
            <div key={`rlabel-${i}`} style={{fontSize:11}}>{labels[i]}</div>
            {row.map((v,j)=> {
              const isSel = selected && ((selected[0]===i && selected[1]===j) || (selected[0]===j && selected[1]===i))
              return (
                <div
                  key={`c-${i}-${j}`}
                  onClick={()=>setSelected([i,j])}
                  title={Number(v).toFixed(2)}
                  style={{
                    height:18,
                    background:color(v),
                    border: isSel ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.08)',
                    textAlign:'center', fontSize:10, cursor:'pointer'
                  }}>
                  {Number(v).toFixed(2)}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
