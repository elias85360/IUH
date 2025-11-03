import { useEffect, useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line } from 'recharts'
import { fetchEnergyBuckets } from '../lib/energy.js'
import { useUiStore } from '../state/filters.js'
import { useSettings } from '../state/settings.js'
import { format } from 'date-fns'
import SkeletonBox from './SkeletonBox.jsx'

export default function UsageEstimateArea({ devices }) {
  const { anchorNow, period } = useUiStore()
  const { options } = useSettings()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([]) // [cum, proj, sigma]

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/48))
      const arr = await fetchEnergyBuckets(devices, from, to, bucketMs)
      // cumul kWh
      let sum=0
      const cum = arr.map(x=>{ sum+=x.kwh; return { ts:x.ts, value:sum } })
      // projection linéaire à partir des 2 derniers points
      let proj=[]
      let sigma=0
      if (cum.length>=2){
        const n=cum.length
        const dt = cum[n-1].ts - cum[n-2].ts
        const dv = cum[n-1].value - cum[n-2].value
        const rate = dt>0? dv/dt : 0
        try {
          const inc=[]
          for (let i=1;i<cum.length;i++){
            const di=cum[i].value - cum[i-1].value
            if (Number.isFinite(di)) inc.push(di)
          }
          const last = inc.slice(-Math.min(12, inc.length))
          const avg  = last.reduce((s,v)=>s+v,0)/Math.max(1,last.length)
          const varr = last.reduce((s,v)=> s + Math.pow(v-avg,2), 0) / Math.max(1,(last.length-1))
          sigma = Math.sqrt(Math.max(0, varr))
        } catch { sigma = 0 }
        const end = from + period.ms
        for (let t=cum[n-1].ts+dt; t<=end; t+=dt){
          proj.push({ ts:t, value: cum[n-1].value + rate*(t-cum[n-1].ts) })
        }
      }
      if (!cancel) setRows([cum, proj, sigma])
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to, period.ms])

  const actual = rows[0]||[]
  const proj    = rows[1]||[]
  const sigma   = Number(rows[2]||0)

  // Lissage optionnel (SMA/EMA) depuis tes settings
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
    // SMA centré
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
  const smoothedProj   = smoothSeries(proj)
  const bandUpper = useMemo(() => smoothedProj.map(p => ({ ts:p.ts, value: p.value + sigma })), [smoothedProj, sigma])
  const bandLower = useMemo(() => smoothedProj.map(p => ({ ts:p.ts, value: Math.max(0, p.value - sigma) })), [smoothedProj, sigma])

  // Échelle Y
  const scale = options?.yScale === 'log' ? 'log' : 'linear'
  let domain = ['auto','auto']
  if (scale === 'log') {
    const values = [...smoothedActual, ...smoothedProj].map(d=>d.value).filter(v=>Number.isFinite(v) && v>0)
    const minVal = values.length ? Math.min(...values) : 1
    const lower = Math.max(1e-3, minVal * 0.9)
    domain = [lower, 'auto']
  }

  // Palette claire (cohérente avec styles.css)
  const GRID = '#e5e7eb'
  const AXIS = '#64748b'
  const AREA_STROKE = '#2563eb'
  const AREA_FILL   = 'rgba(37,99,235,0.12)'
  const PROJ_STROKE = '#f59e0b'
  const BAND_FILL   = 'rgba(245,158,11,0.15)'

  const tooltipStyle = useMemo(()=>({
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
  }), [])

  return (
    <div style={{ height:'var(--chart-h)', minHeight:220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={smoothedActual} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v)=>format(new Date(v),'dd MMM')}
            stroke={AXIS}
            tickLine={false}
          />
          <YAxis stroke={AXIS} tickLine={false} scale={scale} domain={domain} />
          <Tooltip
            labelFormatter={(v)=> new Date(v).toLocaleString()}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'rgba(2,6,23,0.04)' }}
          />
          {/* Courbe réelle */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={AREA_STROKE}
            fill={AREA_FILL}
            name="Actual"
            isAnimationActive={false}
          />

          {/* Bande d'incertitude + projection */}
          {smoothedProj.length>0 && (
            <>
              <Area data={bandUpper} type="monotone" dataKey="value" strokeOpacity={0} fill={BAND_FILL} isAnimationActive={false} name="Forecast (+σ)" />
              <Area data={bandLower} type="monotone" dataKey="value" strokeOpacity={0} fill={BAND_FILL} isAnimationActive={false} name="Forecast (-σ)" />
              <Line data={smoothedProj} type="monotone" dataKey="value" stroke={PROJ_STROKE} dot={false} name="Forecast" />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>

      {(!actual || actual.length===0) && <SkeletonBox height={'100%'} />}
    </div>
  )
}
