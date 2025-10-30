import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { api } from '../services/api.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import { useUiStore } from '../state/filters.js'
import { useSettings } from '../state/settings.js'
import { format } from 'date-fns'

export default function UsageEstimateArea({ devices }) {
  const { anchorNow, period } = useUiStore()
  const { options } = useSettings()
  const from = anchorNow - period.ms
  const to = anchorNow 
  const [rows, setRows] = useState([])

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/48))
      const arr = await fetchEnergyBuckets(devices, from, to, bucketMs)
      // cumulative
      let sum=0
      const cum = arr.map(x=>{ sum+=x.kwh; return { ts:x.ts, value:sum } })
      // simple projection: linear using last two points
      let proj=[]
      let sigma=0
      if (cum.length>=2){
        const n=cum.length
        const dt = cum[n-1].ts - cum[n-2].ts
        const dv = cum[n-1].value - cum[n-2].value
        const rate = dt>0? dv/dt : 0
        // estimate uncertainty from recent increments
        try {
          const inc = []
          for (let i=1;i<cum.length;i++){ const di=cum[i].value - cum[i-1].value; if (Number.isFinite(di)) inc.push(di) }
          const last = inc.slice(-Math.min(12, inc.length))
          const avg = last.reduce((s,v)=>s+v,0)/Math.max(1,last.length)
          const varr = last.reduce((s,v)=> s + Math.pow(v-avg,2), 0) / Math.max(1,(last.length-1))
          sigma = Math.sqrt(Math.max(0, varr))
        } catch { sigma = 0 }
        const end = from + period.ms
        for (let t=cum[n-1].ts+dt; t<=end; t+=dt){ proj.push({ ts:t, value: cum[n-1].value + rate*((t-cum[n-1].ts)) }) }
      }
      if (!cancel) setRows([cum, proj, sigma])
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  const actual = rows[0]||[]
  const proj = rows[1]||[]
  const sigma = Number(rows[2]||0)
  const bandUpper = proj.map(p=> ({ ts:p.ts, value: p.value + sigma }))
  const bandLower = proj.map(p=> ({ ts:p.ts, value: Math.max(0, p.value - sigma) }))

  // Apply optional smoothing based on settings
  function smoothSeries(series) {
    if (!options?.smoothing || !series || series.length < 3) return series
    const w = options.smoothingWindow || 5
    const mode = options.smoothingMode || 'SMA'
    if (mode === 'EMA') {
      const alpha = 2 / (w + 1)
      const ema = []
      for (let i = 0; i < series.length; i++) {
        const prev = i === 0 ? series[i].value : ema[i - 1].value
        const value = series[i].value * alpha + (1 - alpha) * prev
        ema.push({ ts: series[i].ts, value })
      }
      return ema
    }
    // Default: simple moving average
    const sm = []
    for (let i = 0; i < series.length; i++) {
      const a = Math.max(0, i - Math.floor(w / 2))
      const b = Math.min(series.length - 1, i + Math.floor(w / 2))
      const slice = series.slice(a, b + 1)
      const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length
      sm.push({ ts: series[i].ts, value: avg })
    }
    return sm
  }

  const smoothedActual = smoothSeries(actual)
  const smoothedProj = smoothSeries(proj)

  // Determine Y-axis scale and domain
  const scale = options?.yScale === 'log' ? 'log' : 'linear'
  let domain = ['auto', 'auto']
  if (scale === 'log') {
    // gather positive values to compute minimum
    const values = [...smoothedActual, ...smoothedProj].map(d => d.value).filter(v => Number.isFinite(v) && v > 0)
    const minVal = values.length ? Math.min(...values) : 1
    const lower = Math.max(1e-3, minVal * 0.9)
    domain = [lower, 'auto']
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">Usage Estimate (cumulative kWh)</div></div>
      <div style={{flex:1, minHeight:0}}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={smoothedActual} syncId="home">
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={(v)=>format(new Date(v),'dd MMM')} stroke={T.axis}/>
            <YAxis stroke={T.axis} scale={scale} domain={domain}/>
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
            <Area type="monotone" dataKey="value" stroke={T.series.primary} fill="#5bbcff33" name="Réel" />
            {smoothedProj.length>0 && (
              <>
                {/* Uncertainty band */}
                <Area data={bandUpper} type="monotone" dataKey="value" strokeOpacity={0} fill="#f59e0b22" isAnimationActive={false} name="Prévu (+σ)" />
                <Area data={bandLower} type="monotone" dataKey="value" strokeOpacity={0} fill="#f59e0b22" isAnimationActive={false} name="Prévu (-σ)" />
                <Line data={smoothedProj} type="monotone" dataKey="value" stroke={T.series.warning} dot={false} name="Prévu" />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
        {(!actual || actual.length===0) && <SkeletonBox height={'100%'} />}
      </div>
    </div>
  )
}
import SkeletonBox from './SkeletonBox.jsx'
