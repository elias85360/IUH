import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { format } from 'date-fns'

export default function ComparePanel({ devices, metrics=[], metricKey='temperature', period }) {
  const [series, setSeries] = useState([])
  const [mk, setMk] = useState(metricKey)
  const colors = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7','#06b6d4']
  const from = useMemo(()=>Date.now()-period.ms,[period])
  const to = useMemo(()=>Date.now(),[period])

  useEffect(()=>{
    let cancel = false
    async function run() {
      const out = []
      for (const d of devices.slice(0,6)) {
        const res = await api.timeseries(d.id, mk, { from, to, bucketMs: Math.floor((to-from)/200) })
        out.push({ device: d, points: (res.points||[]).map(p=>({ ts:p.ts, [d.id]: Number(p.value) })) })
      }
      if (!cancel) setSeries(out) 
    }
    if (devices.length) run()
    return ()=>{ cancel = true }
  }, [devices, mk, from, to])

  // Merge by timestamp
  const merged = useMemo(()=>{
    const map = new Map()
    for (const s of series) {
      for (const p of s.points) {
        const m = map.get(p.ts) || { ts: p.ts }
        Object.assign(m, p)
        map.set(p.ts, m)
      }
    }
    return Array.from(map.values()).sort((a,b)=>a.ts-b.ts)
  }, [series])

  return (
    <div className="card lg">
      <div className="row" style={{justifyContent:'space-between'}}>
        <h3>Comparaison multi-devices</h3>
        <div className="row" style={{gap:8}}>
          <select className="select" value={mk} onChange={(e)=>setMk(e.target.value)}>
            {(metrics.length?metrics:[{key:mk,displayName:mk}]).map(m => (
              <option key={m.key} value={m.key}>{m.displayName||m.key}</option>
            ))}
          </select>
          <span className="badge">{period.label}</span>
        </div>
      </div>
      <div style={{height:260}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={(v)=>format(new Date(v),'HH:mm:ss')} stroke={T.axis}/>
            <YAxis stroke={T.axis}/>
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
            <Legend />
            {devices.slice(0,6).map((d,idx)=> (
              <Line key={d.id} type="monotone" dataKey={d.id} name={d.name} dot={false} stroke={colors[idx%colors.length]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
