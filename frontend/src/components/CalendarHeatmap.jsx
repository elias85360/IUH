import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function CalendarHeatmap({ devices }) {
  const { anchorNow } = useUiStore()
  const [days, setDays] = useState([]) // [{dateStr, kwh}]
  useEffect(()=>{
    let cancel=false
    async function run(){
      const now = new Date(anchorNow)
      const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      const nextMonth = new Date(now.getFullYear(), now.getMonth()+1, 1).getTime()
      const bucketMs = 24*60*60*1000
      const map = new Map()
      for (const d of devices||[]) {
        const r = await api.timeseries(d.id,'E',{from:first,to:nextMonth,bucketMs})
        for (const p of (r.points||[])){
          const dateStr = new Date(p.ts).toISOString().slice(0,10)
          map.set(dateStr, (map.get(dateStr)||0) + (Number(p.sum||p.value||0)/1000))
        }
      } 
      const arr=[]
      const dt=new Date(first)
      while (dt.getTime()<nextMonth){
        const key=dt.toISOString().slice(0,10); arr.push({ dateStr:key, kwh: map.get(key)||0 }); dt.setDate(dt.getDate()+1)
      }
      if (!cancel) setDays(arr)
    }
    run(); return ()=>{ cancel=true }
  }, [anchorNow, devices])

  const max = Math.max(1, ...days.map(d=>d.kwh))
  return (
    <div className="panel">
      <div className="panel-title">Monthly Energy (kWh/day)</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4}}>
        {days.map(d => {
          const v = d.kwh
          const ratio = v/max
          const bg = `rgba(91,188,255,${0.1 + 0.7*ratio})`
          const title = `${d.dateStr}: ${v.toFixed(1)} kWh`
          return <div key={d.dateStr} title={title} style={{height:18, background:bg, border:'1px solid rgba(255,255,255,0.08)'}}></div>
        })}
      </div>
    </div>
  )
}

