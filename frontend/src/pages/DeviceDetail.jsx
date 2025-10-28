import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, BarChart, Bar, Brush } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { format } from 'date-fns'
import { useUiStore } from '../state/filters.js'
import CorrelationMatrix from '../components/CorrelationMatrix.jsx'
import { useSettings } from '../state/settings.js'
import { useAssets } from '../state/assets.js'
import HeatmapMatrix from '../components/HeatmapMatrix.jsx'
import HistogramBox from '../components/HistogramBox.jsx'
import AnomaliesList from '../components/AnomaliesList.jsx'
import { robustZ, baselineByDOWHour, valueMinusBaseline } from '../lib/statsRobust.js'
// Import additional analysis utilities for derivatives and simple forecasts
import { computeDerivative, detectDerivativeAnomalies, linearForecast } from '../lib/analysisUtils.js'
// Import statistics panel to display descriptive stats
import StatsPanel from '../components/StatsPanel.jsx'
import TopBottom from '../components/TopBottom.jsx'
import { useAnnotations } from '../state/annotations.js'
import { computeStats, rollingZscore, toCsv, download } from '../lib/stats.js'
// Import helpers for JSON export
import { toJson, downloadText } from '../lib/exportUtils.js'
import { useAlerts } from '../state/alerts.js'
import { useAuth } from '../components/AuthProvider.jsx'
 
function Series({ deviceId, metricKey, from, to, bucketMs, valueMin, valueMax }) {
  const [points, setPoints] = useState([])
  useEffect(() => {
    let cancel = false
    const controller = new AbortController()
    async function run() {
      const res = await api.timeseries(deviceId, metricKey, { from, to, bucketMs: bucketMs || Math.floor((to - from) / 200), signal: controller.signal, timeoutMs: 15000 })
      let pts = res.points || []
      // Apply optional value range filtering if provided.  Only
      // points whose numeric value lies between valueMin and
      // valueMax (inclusive) are kept.  Empty strings or
      // undefined bounds are ignored.
      if (valueMin !== undefined && valueMin !== '' && valueMin !== null) {
        const minVal = Number(valueMin)
        if (Number.isFinite(minVal)) {
          pts = pts.filter((p) => Number(p.value) >= minVal)
        }
      }
      if (valueMax !== undefined && valueMax !== '' && valueMax !== null) {
        const maxVal = Number(valueMax)
        if (Number.isFinite(maxVal)) {
          pts = pts.filter((p) => Number(p.value) <= maxVal)
        }
      }
      if (!cancel) setPoints(pts)
    }
    if (deviceId && metricKey) run()
    return () => {
      cancel = true
      try { controller.abort() } catch {}
    }
  }, [deviceId, metricKey, from, to, bucketMs, valueMin, valueMax])
  return points
}

export default function DeviceDetail({ devices, metrics }) {
  const { hasRole } = useAuth()
  const { id } = useParams()
  const device = useMemo(()=> devices.find(d => d.id===id), [devices, id])
  const { period, anchorNow, valueMin, valueMax, hoverTs, setHoverTs, clearHover } = useUiStore()
  const { meta } = useAssets()
  const [modal, setModal] = useState({ open: false })
  const { byDevice, add, remove } = useAnnotations()
  const anns = byDevice[id] || []
  const { options, getThreshold } = useSettings()
  const { live, toggleLive } = useUiStore()
  // State used to force chart re-renders when resetting zoom
  const [resetKey, setResetKey] = useState(0)
  // Search params for drilldown metric
  const [searchParams] = useSearchParams()
  const from = anchorNow - period.ms
  const to = anchorNow
  const modalPanelRef = useRef(null)

  const params = { bucketMs: options.bucketMs }
  const commonArgs = { from, to, ...params, valueMin, valueMax }
  const U = Series({ deviceId: id, metricKey: 'U', ...commonArgs })
  const I = Series({ deviceId: id, metricKey: 'I', ...commonArgs })
  const P = Series({ deviceId: id, metricKey: 'P', ...commonArgs })
  const Eser = Series({ deviceId: id, metricKey: 'E', ...commonArgs })
  const F = Series({ deviceId: id, metricKey: 'F', ...commonArgs })
  const pf = Series({ deviceId: id, metricKey: 'pf', ...commonArgs })
  const temp = Series({ deviceId: id, metricKey: 'temp', ...commonArgs })
  const humid = Series({ deviceId: id, metricKey: 'humid', ...commonArgs })

  // If a specific metric is requested in the query string, open the corresponding modal on mount
  useEffect(() => {
    const m = searchParams.get('metric')
    if (!m) return
    let type = null
    if (m === 'U' || m === 'I') type = 'UI'
    else if (m === 'P' || m === 'E') type = 'P'
    else if (m === 'pf' || m === 'F') type = 'pfF'
    else if (m === 'temp' || m === 'humid') type = 'tH'
    if (type) setModal({ type, open: true })
  }, [searchParams])

  // Focus modal on open
  useEffect(()=>{
    if (modal.open) {
      setTimeout(()=>{
        try { const el = document.getElementById('device-modal-panel'); if (el) el.focus() } catch {}
      }, 0)
    }
  }, [modal.open])

  if (!device) return <div className="panel">Device not found. <Link to="/devices">Back</Link></div>

  function strideDownsample(arr, max = 2000) {
    if (!Array.isArray(arr) || arr.length <= max) return arr
    const stride = Math.ceil(arr.length / max)
    const out = []
    for (let i = 0; i < arr.length; i += stride) out.push(arr[i])
    if (out[out.length - 1]?.ts !== arr[arr.length - 1].ts) out.push(arr[arr.length - 1])
    return out
  }

  const merge = (arr) => {
    // Convert raw points to {ts, value}
    let out = arr.map(p => ({ ts: p.ts, value: Number(p.value) }))
    // Downsample for UI if needed
    out = strideDownsample(out, 2000)
    // Apply optional smoothing based on settings
    const { smoothing, smoothingMode, smoothingWindow } = options
    if (smoothing && out.length > 3) {
      const w = smoothingWindow || 5
      if (smoothingMode === 'EMA') {
        const alpha = 2 / (w + 1)
        const ema = []
        for (let i = 0; i < out.length; i++) {
          const prev = i === 0 ? out[i].value : ema[i - 1].value
          const value = out[i].value * alpha + (1 - alpha) * prev
          ema.push({ ts: out[i].ts, value })
        }
        out = ema
      } else {
        // Default to simple moving average
        const sm = []
        for (let i = 0; i < out.length; i++) {
          const a = Math.max(0, i - Math.floor(w / 2))
          const b = Math.min(out.length - 1, i + Math.floor(w / 2))
          const slice = out.slice(a, b + 1)
          const avg = slice.reduce((s, p) => s + p.value, 0) / slice.length
          sm.push({ ts: out[i].ts, value: avg })
        }
        out = sm
      }
    }
    return out
  }
  function mergeTwo(a, b, kA, kB) {
    const A = merge(a), B = merge(b)
    const map = new Map()
    for (const p of A) { const m = map.get(p.ts)||{ ts:p.ts }; m[kA] = Number(p.value); map.set(p.ts, m) }
    for (const p of B) { const m = map.get(p.ts)||{ ts:p.ts }; m[kB] = Number(p.value); map.set(p.ts, m) }
    return Array.from(map.values()).sort((x,y)=>x.ts-y.ts)
  }
  const fmt = (ts) => format(new Date(ts),'HH:mm')
  const stat = {
    U: computeStats(U), I: computeStats(I), P: computeStats(P), E: computeStats(Eser), F: computeStats(F), pf: computeStats(pf), temp: computeStats(temp), humid: computeStats(humid)
  }
  const [effTh, setEffTh] = useState(null)
  useEffect(()=>{ (async()=>{ try{ const r=await api.thresholdsEffective(id); setEffTh(r.thresholds||null) }catch{ setEffTh(null) } })() }, [id])
  const thresholds = effTh || {
    U: getThreshold(id,'U'), I: getThreshold(id,'I'), P: getThreshold(id,'P'), F: getThreshold(id,'F'), pf: getThreshold(id,'pf'), temp: getThreshold(id,'temp'), humid: getThreshold(id,'humid')
  }
  function levelFor(metric, value){
    const th = thresholds[metric] || {}
    const dir = th.direction || (metric==='pf'?'below':'above')
    const hasRange = (th.warnMin!=null || th.warnMax!=null || th.critMin!=null || th.critMax!=null)
    if (hasRange){
      if (th.critMin!=null && value<=th.critMin) return 'crit'
      if (th.critMax!=null && value>=th.critMax) return 'crit'
      if (th.warnMin!=null && value<=th.warnMin) return 'warn'
      if (th.warnMax!=null && value>=th.warnMax) return 'warn'
      return 'ok'
    }
    if (th.warn==null && th.crit==null) return 'ok'
    if (dir==='below'){
      if (th.crit!=null && value<=th.crit) return 'crit'
      if (th.warn!=null && value<=th.warn) return 'warn'
      return 'ok'
    } else {
      if (th.crit!=null && value>=th.crit) return 'crit'
      if (th.warn!=null && value>=th.warn) return 'warn'
      return 'ok'
    }
  }

  const alerts = useAlerts()
  // Fire alerts on latest points
  useEffect(()=>{
    const latest = [
      { m:'U', arr: U }, { m:'I', arr:I }, { m:'P', arr:P }, { m:'F', arr:F }, { m:'pf', arr:pf }, { m:'temp', arr:temp }, { m:'humid', arr:humid }
    ]
    for (const {m,arr} of latest){
      if (!arr || !arr.length) continue
      const v = Number(arr[arr.length-1].value)
      const lvl = levelFor(m, v)
      if (lvl==='warn' || lvl==='crit') {
        const alert = { deviceId: id, metricKey: m, ts: arr[arr.length-1].ts, value: v, level: lvl }
        alerts.push(alert)
        // Backend notify réservé aux analystes pour éviter des 403 en console
        if (hasRole('analyst')) {
          import('../services/api.js').then(({ api })=>{
            api.notify(alert).catch(()=>{})
          })
        }
      }
    }
  }, [U,I,P,F,pf,temp,humid])

  // Baseline & anomalies (for P)
  const [baselineSeries, setBaselineSeries] = useState([])
  const [anoms, setAnoms] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){
      const end = anchorNow
      const start = anchorNow - 28*24*60*60*1000 // 4 weeks history
      const bucketMs = 60*60*1000
      const hist = await api.timeseries(id, 'P', { from: start, to: end, bucketMs })
      const points = (hist.points||[]).map(p=>({ ts:p.ts, value:Number(p.value) }))
      const grid = baselineByDOWHour(points)
      // build baseline for current window
      const bl = P.map(p => {
        const d = new Date(p.ts)
        const b = grid[d.getDay()][d.getHours()]
        return { ts:p.ts, value: Number.isFinite(b)? b : p.value }
      })
      // anomalies via robust z-score on delta
      const deltas = valueMinusBaseline(P, grid).map(x=>x.delta)
      const rz = robustZ(deltas)
      const anomalies = P.map((pt,i)=> ({ ts: pt.ts, value: pt.value, z: rz[i].z })).filter(a => Math.abs(a.z) >= (options.anomalyZ||3))
      if (!cancel) { setBaselineSeries(bl); setAnoms(anomalies) }
    }
    run(); return ()=>{ cancel=true }
  }, [id, anchorNow, period.ms, P, options.anomalyZ])

  // Compute derivative and simple forecast for P series.  These
  // calculations are performed on the merged, smoothed series to
  // provide additional analytical insights.  The derivative is
  // expressed in value per millisecond.  The forecast projects
  // forward one period window into the future using linear
  // extrapolation based on the last two points.  These values are
  // currently not displayed but can be hooked into future charts or
  // anomaly detection modules.
  const mergedP = useMemo(() => merge(P), [P, options.smoothing, options.smoothingMode, options.smoothingWindow])
  const derivativeP = useMemo(() => computeDerivative(mergedP), [mergedP])
  const derivativeAnoms = useMemo(() => detectDerivativeAnomalies(mergedP, options.anomalyZ || 3), [mergedP, options.anomalyZ])
  const forecastP = useMemo(() => linearForecast(mergedP, period.ms), [mergedP, period.ms])
  // Forecast fan bounds using simple stddev band
  const forecastBand = useMemo(() => {
    try {
      const vals = mergedP.slice(-200).map(p=>Number(p.value)).filter(Number.isFinite)
      if (vals.length < 2 || !forecastP || !forecastP.length) return { upper: [], lower: [] }
      const avg = vals.reduce((a,b)=>a+b,0)/vals.length
      const variance = vals.reduce((s,v)=> s + Math.pow(v-avg,2), 0) / (vals.length-1)
      const sigma = Math.sqrt(Math.max(0, variance))
      const k = 1.0
      return {
        upper: forecastP.map(p => ({ ts: p.ts, value: p.value + k*sigma })),
        lower: forecastP.map(p => ({ ts: p.ts, value: Math.max(0, p.value - k*sigma) })),
      }
    } catch { return { upper: [], lower: [] } }
  }, [mergedP, forecastP])

  // Quality overlay (missing buckets) for all metrics
  const [missingMap, setMissingMap] = useState({ P: [], U: [], I: [], F: [], pf: [], temp: [], humid: [] })
  useEffect(()=>{
    let cancel=false
    ;(async()=>{
      try {
        const bucketMs = options.bucketMs || Math.max(60*1000, Math.floor((to-from)/200))
        const q = new URLSearchParams({ from:String(from), to:String(to), bucketMs:String(bucketMs), detail:'1' })
        const r = await fetch(api.getBaseUrl() + '/api/quality?' + q.toString())
        if (!r.ok) return
        const payload = await r.json()
        const rows = (payload.items||[]).filter(row => row.deviceId===id)
        const map = { P: [], U: [], I: [], F: [], pf: [], temp: [], humid: [] }
        const presentByMetric = {}
        for (const row of rows) {
          if (!Array.isArray(row.presentBuckets)) continue
          presentByMetric[row.metricKey] = new Set(row.presentBuckets.map(Number))
        }
        for (const key of Object.keys(map)) {
          const present = presentByMetric[key]
          if (!present) { map[key] = []; continue }
          const gaps = []
          for (let t = Math.floor(from / bucketMs) * bucketMs; t <= to; t += bucketMs) {
            if (!present.has(t)) gaps.push({ x1: t, x2: t + bucketMs })
          }
          map[key] = gaps
        }
        if (!cancel) setMissingMap(map)
      } catch {}
    })()
    return ()=>{ cancel=true }
  }, [id, from, to, options.bucketMs])

  // Viewport-aware export (from Brush)
  const [viewRange, setViewRange] = useState(null)
  const pData = useMemo(()=> merge(P), [P, options.smoothing, options.smoothingMode, options.smoothingWindow])
  function onPBrushChange(range){
    try {
      if (!range || range.startIndex==null || range.endIndex==null) { setViewRange(null); return }
      const arr = pData
      const a = arr[Math.max(0, range.startIndex)]?.ts
      const b = arr[Math.min(arr.length-1, range.endIndex)]?.ts
      if (Number.isFinite(a) && Number.isFinite(b)) setViewRange({ fromTs: a, toTs: b })
    } catch { setViewRange(null) }
  }

  return (
    <div>
      <div className="panel" style={{marginBottom:12}}>
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="panel-title">{(meta[device.id]?.name)||device.name}</div>
            <div style={{color:'#6b7280'}}>{device.type} • {(meta[device.id]?.room)||device.room||'—'}</div>
          </div>
          <div className="row" style={{gap:8}}>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''} onClick={()=>download(`${id}_U.csv`, toCsv(U))}>Export U (CSV)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''} onClick={()=>download(`${id}_P.csv`, toCsv(P))}>Export P (CSV)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''}
              onClick={()=>{
                try {
                  const arr = pData.filter(p => !viewRange || (p.ts>=viewRange.fromTs && p.ts<=viewRange.toTs)).map(p=>({ ts:p.ts, value:p.value }))
                  download(`${id}_P_view.csv`, toCsv(arr))
                } catch {}
              }}>Export P (CSV, view)</button>
            {/* JSON export buttons */}
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''} onClick={() => { downloadText(`${id}_U.json`, toJson(U)) }}>Export U (JSON)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''} onClick={() => { downloadText(`${id}_P.json`, toJson(P)) }}>Export P (JSON)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rôle analyst':''}
              onClick={async()=>{
                try {
                  const res = await api.exportPdf(id, from, to, (meta[device.id]?.name)||device.name)
                  if (!res || !res.ok) { alert('PDF export not enabled on server'); return }
                  const blob = await res.blob(); const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `${id}_report.pdf`; a.click(); URL.revokeObjectURL(url)
                } catch { /* ignore */ }
              }}>Export PDF</button>
            <button className={`btn ${live? 'primary':''}`} onClick={toggleLive}>{live? 'Live: ON':'Live: OFF'}</button>
            <Link to="/devices" className="btn">← Back</Link>
          </div>
        </div>
      </div>
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-header">
          <div className="panel-title">Annotations</div>
          <div className="row" style={{gap:8}}>
            <input className="input" id="ann-ts" type="datetime-local" />
            <input className="input" id="ann-label" placeholder="Note" />
            <button className="btn" onClick={()=>{
              const tsEl = document.getElementById('ann-ts'); const lb = document.getElementById('ann-label')
              const ts = tsEl && tsEl.value ? Date.parse(tsEl.value) : Date.now()
              if (Number.isFinite(ts)) add(id, { ts, label: lb.value||'Note' })
            }}>Add</button>
          </div>
        </div>
        {anns.length? anns.map(a => (
          <div key={a.id} className="row" style={{justifyContent:'space-between'}}>
            <div>{new Date(a.ts).toLocaleString()}</div>
            <div>{a.label}</div>
            <button className="btn" onClick={()=>remove(id, a.id)}>Delete</button>
          </div>
        )) : <div className="badge">No annotations</div>}
      </div>
      <div className="grid">
        <div className="panel" onClick={()=>setModal({ type:'UI', open:true })} style={{cursor:'zoom-in'}}>
          <div className="panel-title">U (V) & I (A)</div>
          <div style={{height:'var(--chart-h)'}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergeTwo(U, I, 'U', 'I')} syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={14} minTickGap={10}/>
                <YAxis yAxisId={0} stroke={T.axis} domain={["dataMin","dataMax"]} tickCount={8} allowDecimals />
                <YAxis yAxisId={1} orientation="right" stroke={T.axis} domain={["dataMin","dataMax"]} tickCount={8} allowDecimals />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>{
                  const v = Number(val)
                  const tx = name==='U'? thresholds.U : thresholds.I
                  if (!tx) return [v, name]
                  const dir = tx.direction || 'above'
                  let delta = ''
                  if (dir==='above') { if (tx.crit!=null && v>=tx.crit) delta = ` (+${(v-tx.crit).toFixed(1)})`; else if (tx.warn!=null && v>=tx.warn) delta = ` (+${(v-tx.warn).toFixed(1)})` }
                  else { if (tx.crit!=null && v<=tx.crit) delta = ` (${(v-tx.crit).toFixed(1)})`; else if (tx.warn!=null && v<=tx.warn) delta = ` (${(v-tx.warn).toFixed(1)})` }
                  return [v, `${name}${delta}`]
                }} />
                {(missingMap.U||[]).map((g,i)=> (<ReferenceArea key={'mu'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {(missingMap.I||[]).map((g,i)=> (<ReferenceArea key={'mi'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {Number.isFinite(thresholds.U?.warn) && Number.isFinite(thresholds.U?.crit) && (
                  <ReferenceArea yAxisId={0} y1={Math.min(thresholds.U.warn, thresholds.U.crit)} y2={Math.max(thresholds.U.warn, thresholds.U.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.U?.crit) && (
                  <ReferenceArea yAxisId={0} y1={thresholds.U.crit} y2={(stat.U.max||thresholds.U.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                {hoverTs && <ReferenceLine x={hoverTs} stroke={T.brush} strokeDasharray="3 3" />}
                <ReferenceLine y={thresholds.U?.warn??null} stroke={T.series.warning} strokeDasharray="4 2" />
                <ReferenceLine y={thresholds.U?.crit??null} stroke={T.series.danger} strokeDasharray="4 2" />
                <Line type="monotone" yAxisId={0} dataKey="U" stroke={T.series.purple} dot={false} name="U" />
                <Line type="monotone" yAxisId={1} dataKey="I" stroke={T.series.cyan} dot={false} name="I" />
                {options.showBaseline && baselineMap.U.length>0 && <Line type="monotone" yAxisId={0} data={baselineMap.U} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                {options.showBaseline && baselineMap.I.length>0 && <Line type="monotone" yAxisId={1} data={baselineMap.I} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="kpi" style={{marginTop:8}}>
            <div className="item">U last: <strong>{stat.U.last?.toFixed(2)??'—'}</strong> V</div>
            <div className="item">min/max: <strong>{stat.U.min?.toFixed(1)??'—'} / {stat.U.max?.toFixed(1)??'—'}</strong></div>
            <div className="item">avg: <strong>{stat.U.avg?.toFixed(2)??'—'}</strong></div>
          </div>
        </div>
        <div className="panel" onClick={()=>setModal({ type:'P', open:true })} style={{cursor:'zoom-in'}}>
          <div className="panel-title">P (W)</div>
          <div style={{height:'var(--chart-h)'}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merge(P)} syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={14} minTickGap={10}/>
                <YAxis stroke={T.axis} domain={["auto","auto"]} tickCount={12} allowDecimals />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val)=>{
                  const v = Number(val)
                  const th = thresholds.P || {}
                  const dir = th.direction || 'above'
                  let delta = ''
                  if (dir==='above') {
                    if (th.crit!=null && v>=th.crit) delta = ` (+${(v-th.crit).toFixed(0)} over crit)`
                    else if (th.warn!=null && v>=th.warn) delta = ` (+${(v-th.warn).toFixed(0)} over warn)`
                  } else {
                    if (th.crit!=null && v<=th.crit) delta = ` (${(v-th.crit).toFixed(0)}) vs crit`
                    else if (th.warn!=null && v<=th.warn) delta = ` (${(v-th.warn).toFixed(0)}) vs warn`
                  }
                  return [v, `P${delta}`]
                }} />
                {hoverTs && <ReferenceLine x={hoverTs} stroke={T.brush} strokeDasharray="3 3" />}
                {(missingMap.P||[]).map((g,i)=> (<ReferenceArea key={i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.08} />))}
                {Number.isFinite(thresholds.P?.warn) && Number.isFinite(thresholds.P?.crit) && (
                  <ReferenceArea y1={Math.min(thresholds.P.warn, thresholds.P.crit)} y2={Math.max(thresholds.P.warn, thresholds.P.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.P?.crit) && (
                  <ReferenceArea y1={thresholds.P.crit} y2={(stat.P.max||thresholds.P.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                <ReferenceLine y={thresholds.P?.warn??null} stroke={T.series.warning} strokeDasharray="4 2" />
                <ReferenceLine y={thresholds.P?.crit??null} stroke={T.series.danger} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="value" stroke={T.series.secondary}
                  dot={options.highlightAnomalies ? ({ cx, cy, payload }) => {
                    const v = Number(payload.value); const lvl = levelFor('P', v)
                    if (lvl==='ok') return null
                    return (<circle cx={cx} cy={cy} r={3} fill={lvl==='crit'? T.series.danger : T.series.warning} />)
                  } : false}
                  name="P"
                />
                {/* Derived metric overlay P≈U×I when available */}
                {U.length>0 && I.length>0 && (
                  <Line type="monotone" dataKey="value" name="U×I" stroke={T.series.blue} dot={false}
                    data={mergeTwo(U, I, 'U', 'I').map(p => ({ ts: p.ts, value: (Number(p.U)||0) * (Number(p.I)||0) }))}
                    strokeDasharray="6 3"
                  />
                )}
                {options.showBaseline && <Line type="monotone" dataKey="value" data={baselineSeries} stroke={T.series.gray} dot={false} name="baseline" strokeDasharray="4 3" />}
                {options.showForecast && forecastP && forecastP.length>0 && (
                  <>
                    <Line type="monotone" data={forecastP} dataKey="value" stroke={T.series.blue} dot={false} name="forecast" strokeDasharray="6 3" />
                    {forecastBand.upper.length>0 && <Line type="monotone" data={forecastBand.upper} dataKey="value" stroke={T.series.blue} dot={false} strokeDasharray="2 6" />}
                    {forecastBand.lower.length>0 && <Line type="monotone" data={forecastBand.lower} dataKey="value" stroke={T.series.blue} dot={false} strokeDasharray="2 6" />}
                  </>
                )}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} onChange={onPBrushChange} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="kpi" style={{marginTop:8}}>
            <div className="item">P last: <strong>{stat.P.last?.toFixed(0)??'—'}</strong> W</div>
            <div className="item">min/max: <strong>{stat.P.min?.toFixed(0)??'—'} / {stat.P.max?.toFixed(0)??'—'}</strong></div>
            <div className="item">avg: <strong>{stat.P.avg?.toFixed(0)??'—'}</strong></div>
          </div>
        </div>
        <div className="panel" style={{cursor:'zoom-in'}}>
          <div className="panel-title">Energy (kWh)</div>
          <div style={{height:'var(--chart-h)'}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merge(Eser).map(p=>({ ...p, value: Number(p.value)/1000 }))} syncId={`dev-${id}`}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={14} minTickGap={10}/>
                <YAxis stroke={T.axis} tickCount={12} allowDecimals />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                <Line type="monotone" dataKey="value" stroke={T.series.primary} dot={false} name="E (kWh)" />
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="kpi" style={{marginTop:8}}>
            <div className="item">E last: <strong>{stat.E.last?.toFixed(2)??'—'}</strong> kWh</div>
          </div>
        </div>
        <div className="panel" onClick={()=>setModal({ type:'pfF', open:true })} style={{cursor:'zoom-in'}}>
          <div className="panel-title">pf & F (Hz)</div>
          <div style={{height:'var(--chart-h)'}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergeTwo(pf, F, 'pf', 'F')} syncId={`dev-${id}`}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" stroke={T.axis} tickFormatter={fmt} tickCount={14} minTickGap={10}/>
                <YAxis yAxisId={0} stroke={T.axis} domain={[0,1]} tickCount={11} allowDecimals tickFormatter={(v)=>v.toFixed(2)}/>
                <YAxis yAxisId={1} orientation="right" stroke={T.axis} domain={["dataMin","dataMax"]} tickCount={8} allowDecimals />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>{
                  const v = Number(val)
                  const tx = name==='pf'? thresholds.pf : thresholds.F
                  if (!tx) return [v, name]
                  const dir = tx.direction || (name==='pf' ? 'below' : 'above')
                  let delta = ''
                  if (dir==='above') { if (tx.crit!=null && v>=tx.crit) delta = ` (+${(v-tx.crit).toFixed(2)})`; else if (tx.warn!=null && v>=tx.warn) delta = ` (+${(v-tx.warn).toFixed(2)})` }
                  else { if (tx.crit!=null && v<=tx.crit) delta = ` (${(v-tx.crit).toFixed(2)})`; else if (tx.warn!=null && v<=tx.warn) delta = ` (${(v-tx.warn).toFixed(2)})` }
                  return [v, `${name}${delta}`]
                }} />
                {(missingMap.pf||[]).map((g,i)=> (<ReferenceArea key={'mpf'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {(missingMap.F||[]).map((g,i)=> (<ReferenceArea key={'mf'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {/* pf below-threshold shading: [0,crit]=red, [crit,warn]=yellow */}
                {Number.isFinite(thresholds.pf?.crit) && (
                  <ReferenceArea yAxisId={0} y1={0} y2={thresholds.pf.crit} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.pf?.warn) && Number.isFinite(thresholds.pf?.crit) && thresholds.pf.warn>thresholds.pf.crit && (
                  <ReferenceArea yAxisId={0} y1={thresholds.pf.crit} y2={thresholds.pf.warn} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {/* F above-threshold shading */}
                {Number.isFinite(thresholds.F?.warn) && Number.isFinite(thresholds.F?.crit) && (
                  <ReferenceArea yAxisId={1} y1={Math.min(thresholds.F.warn, thresholds.F.crit)} y2={Math.max(thresholds.F.warn, thresholds.F.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.F?.crit) && (
                  <ReferenceArea yAxisId={1} y1={thresholds.F.crit} y2={(stat.F.max||thresholds.F.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                <ReferenceLine y={thresholds.pf?.warn??null} stroke={T.series.warning} strokeDasharray="4 2" />
                <ReferenceLine y={thresholds.pf?.crit??null} stroke={T.series.danger} strokeDasharray="4 2" />
                <Line type="monotone" yAxisId={0} dataKey="pf" stroke={T.series.warning} dot={false} name="pf" />
                <Line type="monotone" yAxisId={1} dataKey="F" stroke={T.series.blue} dot={false} name="F" />
                {options.showBaseline && baselineMap.pf.length>0 && <Line type="monotone" yAxisId={0} data={baselineMap.pf} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                {options.showBaseline && baselineMap.F.length>0 && <Line type="monotone" yAxisId={1} data={baselineMap.F} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel" onClick={()=>setModal({ type:'tH', open:true })} style={{cursor:'zoom-in'}}>
          <div className="panel-title">Temperature (°C) & Humidity (%)</div>
          <div style={{height:260}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergeTwo(temp, humid, 'temp', 'humid')} syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" stroke={T.axis} tickFormatter={fmt} tickCount={14} minTickGap={10}/>
                <YAxis yAxisId={0} stroke={T.axis} domain={["dataMin","dataMax"]} tickCount={8} allowDecimals />
                <YAxis yAxisId={1} orientation="right" stroke={T.axis} domain={["dataMin","dataMax"]} tickCount={8} allowDecimals />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>{
                  const v = Number(val)
                  const tx = name==='temp'? thresholds.temp : thresholds.humid
                  if (!tx) return [v, name]
                  const dir = tx.direction || 'above'
                  let delta = ''
                  if (dir==='above') { if (tx.crit!=null && v>=tx.crit) delta = ` (+${(v-tx.crit).toFixed(1)})`; else if (tx.warn!=null && v>=tx.warn) delta = ` (+${(v-tx.warn).toFixed(1)})` }
                  else { if (tx.crit!=null && v<=tx.crit) delta = ` (${(v-tx.crit).toFixed(1)})`; else if (tx.warn!=null && v<=tx.warn) delta = ` (${(v-tx.warn).toFixed(1)})` }
                  return [v, `${name}${delta}`]
                }} />
                {(missingMap.temp||[]).map((g,i)=> (<ReferenceArea key={'mt'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {(missingMap.humid||[]).map((g,i)=> (<ReferenceArea key={'mh'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {hoverTs && <ReferenceLine x={hoverTs} stroke={T.brush} strokeDasharray="3 3" />}
                {Number.isFinite(thresholds.temp?.warn) && Number.isFinite(thresholds.temp?.crit) && (
                  <ReferenceArea yAxisId={0} y1={Math.min(thresholds.temp.warn, thresholds.temp.crit)} y2={Math.max(thresholds.temp.warn, thresholds.temp.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.temp?.crit) && (
                  <ReferenceArea yAxisId={0} y1={thresholds.temp.crit} y2={(stat.temp.max||thresholds.temp.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.humid?.warn) && Number.isFinite(thresholds.humid?.crit) && (
                  <ReferenceArea yAxisId={1} y1={Math.min(thresholds.humid.warn, thresholds.humid.crit)} y2={Math.max(thresholds.humid.warn, thresholds.humid.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.humid?.crit) && (
                  <ReferenceArea yAxisId={1} y1={thresholds.humid.crit} y2={(stat.humid.max||thresholds.humid.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                <Line type="monotone" yAxisId={0} dataKey="temp" stroke={T.series.danger} dot={false} name="temp" />
                <Line type="monotone" yAxisId={1} dataKey="humid" stroke={T.series.cyan} dot={false} name="humid" />
                {options.showBaseline && baselineMap.temp.length>0 && <Line type="monotone" yAxisId={0} data={baselineMap.temp} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                {options.showBaseline && baselineMap.humid.length>0 && <Line type="monotone" yAxisId={1} data={baselineMap.humid} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <HeatmapMatrix deviceId={id} metric='P' title='Power Heatmap (hour × day)' />
        <HistogramBox deviceId={id} metric='P' />
        <AnomaliesList anomalies={anoms} />
        <CorrelationMatrix deviceId={id} />
        <TopBottom devices={devices} metric='P' period={period} />
        {/* Descriptive statistics for Power metric */}
        <StatsPanel series={mergedP} metric="P" />
      </div>
      {modal.open && (
        <div role="dialog" aria-modal="true" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={()=>setModal({open:false})}
          onKeyDown={(e)=>{ if (e.key==='Escape') setModal({open:false}) }}>
          <div className="panel" style={{width:'90%', height:'70%'}} onClick={(e)=>e.stopPropagation()} tabIndex={0} id="device-modal-panel">
            {/* Modal header with reset button */}
            <div className="row" style={{justifyContent:'flex-end', marginBottom:8}}>
              <button className="btn" onClick={() => setResetKey(k => k + 1)}>Reset zoom</button>
            </div>
            {modal.type==='UI' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={resetKey} data={mergeTwo(U, I, 'U', 'I')}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={12}/>
                  <YAxis stroke={T.axis} tickCount={10}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="U" stroke={T.series.purple} dot={false} />
                  <Line type="monotone" dataKey="I" stroke={T.series.cyan} dot={false} />
                  <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {modal.type==='P' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={resetKey} data={merge(P)} onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={12}/>
                  <YAxis stroke={T.axis} tickCount={10}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke={T.series.secondary} dot={false} />
                  {options.showBaseline && <Line type="monotone" dataKey="value" data={baselineSeries} stroke={T.series.gray} dot={false} name="baseline" strokeDasharray="4 3" />}
                  {options.showForecast && forecastP && forecastP.length>0 && (
                    <Line type="monotone" data={forecastP} dataKey="value" stroke={T.series.blue} dot={false} name="forecast" strokeDasharray="6 3" />
                  )}
                  <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {modal.type==='pfF' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={resetKey} data={mergeTwo(pf, F, 'pf', 'F')}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={12}/>
                  <YAxis stroke={T.axis} tickCount={10}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="pf" stroke={T.series.warning} dot={false} />
                  <Line type="monotone" dataKey="F" stroke={T.series.blue} dot={false} />
                  <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {modal.type==='tH' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={resetKey} data={mergeTwo(temp, humid, 'temp', 'humid')}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tickFormatter={fmt} stroke={T.axis} tickCount={12}/>
                  <YAxis stroke={T.axis} tickCount={10}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="temp" stroke={T.series.danger} dot={false} />
                  <Line type="monotone" dataKey="humid" stroke={T.series.cyan} dot={false} />
                  <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
