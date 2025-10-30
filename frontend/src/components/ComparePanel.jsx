import { useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../services/api.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { timeTickFormatter, yDomainFor, yTickFormatterFor, bucketForSpan } from '../lib/format.js'

export default function ComparePanel({ devices, metrics=[], metricKey='temperature', period }) {
  const [series, setSeries] = useState([])
  const [mk, setMk] = useState(metricKey)
  const [hoverTs, setHoverTs] = useState(null)
  const from = useMemo(()=>Date.now()-period.ms,[period])
  const to = useMemo(()=>Date.now(),[period])
  const span = to - from

  useEffect(()=>{
    let cancel = false
    async function run() {
      const out = []
      const bucketMs = bucketForSpan(span)
      for (const d of devices.slice(0,6)) {
        const res = await api.timeseries(d.id, mk, { from, to, bucketMs })
        out.push({ device: d, points: (res.points||[]).map(p=>({ ts:Number(p.ts), value: Number(p.value) })) })
      }
      if (!cancel) setSeries(out) 
    }
    if (devices.length) run()
    return ()=>{ cancel = true }
  }, [devices, mk, from, to, span])

  return (
    <div className="card lg">
      <div className="row" style={{justifyContent:'space-between'}}>
        <h3>Comparaison multi‑devices</h3>
        <div className="row" style={{gap:8}}>
          <select className="select" value={mk} onChange={(e)=>setMk(e.target.value)}>
            {(metrics.length?metrics:[{key:mk,displayName:mk}]).map(m => (
              <option key={m.key} value={m.key}>{m.displayName||m.key}</option>
            ))}
          </select>
          <span className="badge">{period.label}</span>
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
        {series.map((s)=> (
          <div key={s.device.id} className="statcard">
            <div className="stat-title">{s.device.name}</div>
            <div style={{height:120}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.points} syncId="compare"
                  onMouseMove={(e)=>{ const ts=e?.activeLabel; if (Number.isFinite(ts)) setHoverTs(ts) }}
                  onMouseLeave={()=>setHoverTs(null)}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" type="number" domain={[from, to]} tickFormatter={timeTickFormatter(from,to)} stroke={T.axis} tick={{fontSize:11}}/>
                  <YAxis stroke={T.axis} domain={yDomainFor(mk, s.points)} tickFormatter={yTickFormatterFor(mk)} allowDecimals tick={{fontSize:11}}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(v)=>yTickFormatterFor(mk)(v)} />
                  {hoverTs && <ReferenceLine x={hoverTs} stroke={T.axis} strokeDasharray="3 3" />}
                  <Line type="monotone" dataKey="value" dot={false} stroke={T.series.blue} strokeWidth={1.4} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
