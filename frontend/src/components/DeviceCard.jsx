import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { useDataCache } from '../state/dataCache.js'
import { useUiStore } from '../state/filters.js'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Brush, ResponsiveContainer, Scatter, ScatterChart, Line, LineChart, Bar, BarChart, PieChart, Pie, Cell, ReferenceLine } from 'recharts'
import { format } from 'date-fns'

function useSeries(deviceId, metricKey, from, to, bucketMs, live) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const cache = useDataCache()
  useEffect(()=>{
    let cancel = false
    async function run() {
      setLoading(true) 
      try {
        const autoBucket = Math.floor((to-from)/200)
        const res = await api.timeseries(deviceId, metricKey, { from, to, bucketMs: bucketMs || autoBucket })
        if (!cancel) setData(res.points || [])
      } finally { if (!cancel) setLoading(false) }
    }
    if (deviceId && metricKey && from && to) run()
    return ()=>{ cancel = true }
  }, [deviceId, metricKey, from, to, bucketMs])

  // Merge live points from cache
  const livePoints = live ? cache.getSeries(deviceId, metricKey, from, to) : []
  const merged = useMemo(()=>{
    if (!live || !livePoints.length) return data
    const map = new Map(data.map(p=>[p.ts, { ...p }]))
    for (const p of livePoints) {
      const v = map.get(p.ts) || { ts: p.ts }
      v.value = p.value
      map.set(p.ts, v)
    }
    return Array.from(map.values()).sort((a,b)=>a.ts-b.ts)
  }, [data, live, livePoints])

  return { data: merged, loading }
}

export default function DeviceCard({ device, metrics, period, chartType='line' }) {
  const from = useMemo(()=>Date.now()-period.ms, [period])
  const to = useMemo(()=>Date.now(), [period])
  const firstMetric = metrics[0]
  const [metricKey, setMetricKey] = useState(firstMetric?.key)
  useEffect(()=>{ setMetricKey(firstMetric?.key) }, [firstMetric?.key])

  const def = useMemo(()=> metrics.find(m=>m.key===metricKey), [metrics, metricKey])
  const { live, bucketMs, smoothing, highlightAnomalies } = useUiStore()
  const { data } = useSeries(device.id, metricKey, from, to, bucketMs, live)

  const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#a855f7']
  const warn = def?.thresholds?.warn
  const crit = def?.thresholds?.crit

  let chartData = data.map(p=>({ ts:p.ts, value:Number(p.value) }))
  if (smoothing && chartData.length > 3) {
    // simple moving average window 5
    const w = 5; const out = []
    for (let i=0;i<chartData.length;i++){
      const a = Math.max(0, i-Math.floor(w/2)); const b = Math.min(chartData.length-1, i+Math.floor(w/2))
      const slice = chartData.slice(a,b+1); const avg = slice.reduce((s,p)=>s+p.value,0)/slice.length
      out.push({ ts: chartData[i].ts, value: avg })
    }
    chartData = out
  }
  const formatTs = (ts)=>format(new Date(ts),'HH:mm:ss')

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <h3>{device.name} <span className="tag">{device.type}</span> <span className="tag">{device.room}</span></h3>
        <div className="row">
          <select className="select" value={metricKey} onChange={e=>setMetricKey(e.target.value)}>
            {metrics.map(m=> <option key={m.key} value={m.key}>{m.displayName}</option>)}
          </select>
          <span className="badge">{period.label}</span>
        </div>
      </div>
      <div className="kpi" style={{marginBottom:8}}>
        {metrics.map(m=> (
          <div key={m.key} className="item">
            <span style={{color:'#9ca3af'}}>{m.displayName}</span>{' '}
            <strong>{m.key===metricKey && chartData.length? chartData[chartData.length-1].value.toFixed(2): '—'}</strong>{' '}
            <span style={{color:'#9ca3af'}}>{m.unit}</span>
          </div>
        ))}
      </div>
      <div className="row" style={{justifyContent:'flex-end', marginBottom: 6}}>
        <a className="btn" href={api.exportCsvUrl(device.id, metricKey, from, to)} target="_blank" rel="noreferrer">Export CSV</a>
      </div>
      <div style={{height:220}}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType==='bar' ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tickFormatter={formatTs} stroke="#9ca3af"/>
              <YAxis stroke="#9ca3af" />
              <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
              {warn!=null && <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 2" />}
              {crit!=null && <ReferenceLine y={crit} stroke="#ef4444" strokeDasharray="4 2" />}
              <Bar dataKey="value" fill={COLORS[0]} />
              <Brush dataKey="ts" height={20} stroke="#374151" travellerWidth={10}/>
            </BarChart>
          ) : chartType==='area' ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tickFormatter={formatTs} stroke="#9ca3af"/>
              <YAxis stroke="#9ca3af" />
              <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
              {warn!=null && <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 2" />}
              {crit!=null && <ReferenceLine y={crit} stroke="#ef4444" strokeDasharray="4 2" />}
              <Area type="monotone" dataKey="value" stroke={COLORS[0]} fill="#0b9b5a33" />
              <Brush dataKey="ts" height={20} stroke="#374151" travellerWidth={10}/>
            </AreaChart>
          ) : chartType==='scatter' ? (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tickFormatter={formatTs} stroke="#9ca3af"/>
              <YAxis dataKey="value" stroke="#9ca3af" />
              <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
              <Scatter data={chartData} fill={COLORS[0]} />
              <Brush dataKey="ts" height={20} stroke="#374151" travellerWidth={10}/>
            </ScatterChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tickFormatter={formatTs} stroke="#9ca3af"/>
              <YAxis stroke="#9ca3af" />
              <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
              {warn!=null && <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 2" />}
              {crit!=null && <ReferenceLine y={crit} stroke="#ef4444" strokeDasharray="4 2" />}
              <Line type="monotone" dataKey="value" stroke={COLORS[0]}
                dot={highlightAnomalies ? ({ cx, cy, payload }) => {
                  const level = (crit!=null && payload.value>=crit)?'crit':((warn!=null && payload.value>=warn)?'warn':'ok')
                  if (level==='ok') return null
                  return (<circle cx={cx} cy={cy} r={3} fill={level==='crit'? '#ef4444':'#f59e0b'} />)
                } : false}
              />
              <Brush dataKey="ts" height={20} stroke="#374151" travellerWidth={10}/>
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
