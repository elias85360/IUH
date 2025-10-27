import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { chartTheme as T } from '../lib/theme.js'

function percentile(values, p) {
  const a = values.filter(Number.isFinite).slice().sort((x,y)=>x-y)
  if (!a.length) return NaN
  const idx = (a.length-1)*p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo===hi) return a[lo]
  return a[lo] + (a[hi]-a[lo])*(idx-lo)
}

export default function HistogramBox({ deviceId, metric='P' }) {
  const { anchorNow, period } = useUiStore()
  const [rows, setRows] = useState([])
  const [perc, setPerc] = useState({ p05:NaN, p50:NaN, p95:NaN })

  useEffect(()=>{ 
    let cancel=false
    async function run(){
      const to = anchorNow
      const from = anchorNow - period.ms
      const bucketMs = Math.max(60*1000, Math.floor((to-from)/300))
      const r = await api.timeseries(deviceId, metric, { from, to, bucketMs })
      const vals = (r.points||[]).map(p=>Number(p.value)).filter(Number.isFinite)
      const min = Math.min(...vals, 0), max = Math.max(...vals, 1)
      const bins = 16
      const step = (max-min)/bins || 1
      const hist = Array.from({length:bins}, (_,i)=>({ x: min+i*step, count:0 }))
      for (const v of vals){
        const idx = Math.min(bins-1, Math.max(0, Math.floor((v-min)/step)))
        hist[idx].count++
      }
      if (!cancel) {
        setRows(hist)
        setPerc({ p05: percentile(vals,0.05), p50: percentile(vals,0.5), p95: percentile(vals,0.95) })
      }
    }
    run(); return ()=>{ cancel=true }
  }, [deviceId, anchorNow, period, metric])

  return (
    <div className="panel">
      <div className="panel-title">Histogram ({metric})</div>
      <div style={{height:220}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey={(d)=>d.x.toFixed(1)} stroke={T.axis} interval={2} />
            <YAxis stroke={T.axis} />
            <Tooltip />
            <Bar dataKey="count" fill={T.series.purple} />
            {Number.isFinite(perc.p05) && <ReferenceLine x={perc.p05.toFixed(1)} stroke={T.series.warning} />}
            {Number.isFinite(perc.p50) && <ReferenceLine x={perc.p50.toFixed(1)} stroke={T.series.primary} />}
            {Number.isFinite(perc.p95) && <ReferenceLine x={perc.p95.toFixed(1)} stroke={T.series.danger} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="kpi" style={{marginTop:8}}>
        <div className="item">P05: <strong>{Number.isFinite(perc.p05)? perc.p05.toFixed(2): '—'}</strong></div>
        <div className="item">P50: <strong>{Number.isFinite(perc.p50)? perc.p50.toFixed(2): '—'}</strong></div>
        <div className="item">P95: <strong>{Number.isFinite(perc.p95)? perc.p95.toFixed(2): '—'}</strong></div>
      </div>
    </div>
  )
}

