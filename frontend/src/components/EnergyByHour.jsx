import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { format } from 'date-fns'

export default function EnergyByHour({ devices }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - Math.min(period.ms, 24*60*60*1000)
  const to = anchorNow
  const [rows, setRows] = useState([])
  const colors = ['#6366f1','#22c55e','#3b82f6','#f59e0b','#ef4444','#06b6d4','#a855f7','#84cc16']

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = 60*60*1000
      const map = new Map()
      const keys = []
      for (const d of devices) {
        keys.push(d.id) 
        const r = await api.timeseries(d.id, 'E', { from, to, bucketMs })
        for (const p of (r.points||[])){
          const x = map.get(p.ts) || { ts: p.ts }
          x[d.id] = (x[d.id]||0) + Number(p.sum||p.value||0)/1000 // kWh
          map.set(p.ts, x)
        }
      }
      const merged = Array.from(map.values()).sort((a,b)=>a.ts-b.ts)
      if (!cancel) setRows(merged)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to])

  return (
    <div className="panel">
      <div className="panel-title">Energy by hour (kWh, stacked)</div>
      <div style={{height:260}}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} syncId="home">
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="ts" tickFormatter={(v)=>format(new Date(v),'dd HH:mm')} stroke="#6b7280"/>
            <YAxis stroke="#6b7280"/>
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
            <Legend />
            {devices.map((d,idx)=> (
              <Area key={d.id} type="monotone" dataKey={d.id} name={d.name} stackId="1" stroke={colors[idx%colors.length]} fill={`${colors[idx%colors.length]}33`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
