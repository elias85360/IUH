import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { formatValue } from '../lib/format.js'

export default function HeatmapMatrix({ deviceId, metric='P', title='Heatmap (hour × day)' }) {
  const { anchorNow, period } = useUiStore()
  const [grid, setGrid] = useState(() => Array.from({length:7},()=>Array.from({length:24},()=>0)))
  const containerRef = useRef(null)

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

  const exportPng = () => {
    try {
      const cellW = 20, cellH = 18, pad = 4, labelW = 30, headerH = 18
      const W = labelW + (24*cellW) + pad*2
      const H = headerH + (7*cellH) + pad*2
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H)
      ctx.fillStyle = '#111827'; ctx.font = '10px sans-serif'
      // hours
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (let h=0; h<24; h++) ctx.fillText(String(h), labelW + pad + h*cellW + cellW/2, pad + headerH/2)
      // days + cells
      for (let i=0;i<7;i++) {
        ctx.textAlign = 'left'; ctx.fillStyle = '#111827'
        ctx.fillText(days[i], pad, headerH + pad + i*cellH + cellH/2)
        for (let h=0;h<24;h++) {
          const val = grid?.[i]?.[h] || 0
          const ratio = Math.max(0, Math.min(1, val/max))
          const alpha = 0.1 + 0.7*ratio
          ctx.fillStyle = `rgba(91,188,255,${alpha})`
          ctx.fillRect(labelW + pad + h*cellW, headerH + pad + i*cellH, cellW-1, cellH-1)
          ctx.strokeStyle = 'rgba(0,0,0,0.05)'
          ctx.strokeRect(labelW + pad + h*cellW, headerH + pad + i*cellH, cellW-1, cellH-1)
        }
      }
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a'); a.href = url; a.download = 'heatmap.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {}
  }

  return (
    <div className="panel" ref={containerRef}>
      <div className="panel-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="panel-title">{title}</div>
        <button className="btn" onClick={exportPng}>Export PNG</button>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(25, 1fr)', gap:2}}>
        <div></div>
        {Array.from({length:24},(_,h)=>(<div key={h} style={{fontSize:10, textAlign:'center'}}>{h}</div>))}
        {grid.map((row, i)=> (
          <React.Fragment key={`row-${i}`}>
            <div key={`dlabel-${i}`} style={{fontSize:10}}>{days[i]}</div>
            {row.map((val,h)=>{
              const ratio = val/max
              const bg = `rgba(91,188,255,${0.1 + 0.7*ratio})`
              const title = formatValue(metric, val)
              return <div key={`cell-${i}-${h}`} title={title} style={{height:18, background:bg, border:'1px solid rgba(255,255,255,0.08)'}} />
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
