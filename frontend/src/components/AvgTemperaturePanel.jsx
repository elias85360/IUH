import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { format } from 'date-fns'

export default function AvgTemperaturePanel({ devices, from, to }) {
  const [data, setData] = useState([])
  const bucketMs = Math.floor((to-from)/120)
  const normal = 24
  useEffect(()=>{
    let cancel=false
    async function run(){
      const arr=[]
      for (const d of devices) {
        const r = await api.timeseries(d.id, 'temp', { from, to, bucketMs })
        arr.push(r.points||[])
      }
      const map = new Map()
      for (const series of arr) {
        for (const p of series) {
          const m = map.get(p.ts) || { ts: p.ts, sum:0, count:0 }
          m.sum += Number(p.value)||0; m.count += 1
          map.set(p.ts, m)
        }
      } 
      const merged = Array.from(map.values()).sort((a,b)=>a.ts-b.ts).map(m=>({ ts:m.ts, value:m.sum/m.count }))
      if (!cancel) setData(merged)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to, bucketMs])
  const midTs = useMemo(()=> Math.floor((from+to)/2), [from,to])
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Average office temperature</div>
        <div className="row" style={{gap:8}}>
          <button className="btn">10-10-2022 - 10-10-2022</button>
          <button className="btn">Filtr</button>
          <button className="btn">⋮</button>
        </div>
      </div>
      <div style={{height:300}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={(v)=>format(new Date(v),'HH:mm')} stroke={T.axis}/>
            <YAxis stroke={T.axis}/>
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
            <ReferenceLine y={normal} stroke={T.series.blue} strokeDasharray="4 2"/>
            <ReferenceLine x={midTs} stroke={T.series.blue} strokeDasharray="6 4"/>
            <Line type="monotone" dataKey="value" stroke={T.series.purple} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:'flex', gap:24, marginTop:8, color:'#6b7280'}}>
        <div><span style={{color:'#93c5fd'}}>━</span> Average normal temperature according to the office requirements</div>
        <div><span style={{color:'#6366f1'}}>━</span> Current temperature</div>
      </div>
    </div>
  )
}
