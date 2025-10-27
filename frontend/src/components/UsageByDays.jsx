import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const COLORS = ['#5bbcff','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function UsageByDays({ devices, from, to }) {
  const [data, setData] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = 24*60*60*1000
      const map = new Map()
      for (const d of devices) { 
        const res = await api.timeseries(d.id, 'E', { from: to - 7*bucketMs, to, bucketMs })
        for (const p of (res.points||[])) {
          const day = new Date(p.ts).toLocaleDateString('en-US', { weekday: 'long' })
          map.set(day, (map.get(day)||0) + (p.sum||p.value||0)/1000)
        }
      }
      const rows = days.map((day,i)=> ({ name: day, value: Math.round(map.get(day)||0) }))
      if (!cancel) setData(rows)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to])
  return (
    <div className="panel">
      <div className="panel-title">Electricity usage by days</div>
      <div style={{height:280}}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:4, marginTop:8}}>
        {data.map((d,i)=> (
          <div key={i} className="row" style={{gap:8, color:'#6b7280'}}>
            <span style={{display:'inline-block', width:12, height:12, background:COLORS[i%COLORS.length], borderRadius:999}}></span>
            <span style={{width:120}}>{d.name}</span>
            <strong>{d.value}kW</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
