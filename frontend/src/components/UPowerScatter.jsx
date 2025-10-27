import { useEffect, useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function UPowerScatter({ devices }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [series, setSeries] = useState([])
  const colors = ['#6366f1','#22c55e','#3b82f6','#f59e0b','#ef4444','#06b6d4']

  useEffect(()=>{ 
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*1000, Math.floor((to-from)/200))
      const out=[]
      for (const d of devices) {
        const [U,P] = await Promise.all([
          api.timeseries(d.id,'U', { from,to,bucketMs }),
          api.timeseries(d.id,'P', { from,to,bucketMs }),
        ])
        const map = new Map()
        for (const p of (U.points||[])) { map.set(p.ts, { x:Number(p.value) }) }
        for (const p of (P.points||[])) { const m = map.get(p.ts)||{}; m.y=Number(p.value); map.set(p.ts,m) }
        const pts = Array.from(map.values()).filter(p=>Number.isFinite(p.x) && Number.isFinite(p.y))
        out.push({ device:d, points:pts })
      }
      if (!cancel) setSeries(out)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to])

  return (
    <div className="panel">
      <div className="panel-title">Correlation U vs P</div>
      <div style={{height:260}}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis type="number" dataKey="x" name="U" unit="V" stroke="#6b7280"/>
            <YAxis type="number" dataKey="y" name="P" unit="W" stroke="#6b7280"/>
            <Tooltip />
            <Legend />
            {series.map((s,idx)=> (
              <Scatter key={s.device.id} name={s.device.name} data={s.points} fill={colors[idx%colors.length]} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

