import React, { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function HeatmapMatrix({ deviceId, metric='P', title='Heatmap (hour × day)' }) {
  const { anchorNow, period } = useUiStore()
  const [grid, setGrid] = useState(() => Array.from({length:7},()=>Array.from({length:24},()=>0)))

  useEffect(()=>{
    let cancel=false
    async function run(){
      const to = anchorNow
      const from = anchorNow - Math.min(period.ms, 7*24*60*60*1000) // last 7d for heatmap
      const bucketMs = 60*60*1000
      const r = await api.timeseries(deviceId, metric, { from, to, bucketMs })
      const g = Array.from({length:7},()=>Array.from({length:24},()=>0))
      for (const p of (r.points||[])){
        const d = new Date(p.ts) 
        const v = Number(p.value || p.sum || 0)
        g[d.getDay()][d.getHours()] += v
      }
      if (!cancel) setGrid(g)
    }
    run(); return ()=>{ cancel=true }
  }, [deviceId, anchorNow, period, metric])

  const max = Math.max(1, ...grid.flat())
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(25, 1fr)', gap:2}}>
        <div></div>
        {Array.from({length:24},(_,h)=>(<div key={h} style={{fontSize:10, textAlign:'center'}}>{h}</div>))}
        {grid.map((row, i)=> (
          <React.Fragment key={`row-${i}`}>
            <div key={`dlabel-${i}`} style={{fontSize:10}}>{days[i]}</div>
            {row.map((val,h)=>{
              const ratio = val/max
              const bg = `rgba(91,188,255,${0.1 + 0.7*ratio})`
              return <div key={`cell-${i}-${h}`} title={`${val.toFixed(2)}`} style={{height:18, background:bg, border:'1px solid rgba(255,255,255,0.08)'}} />
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
