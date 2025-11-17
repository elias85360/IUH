import { use, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api.js'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, BarChart, Bar, Brush, AreaChart, Area, ComposedChart } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { registerBaseCharts, registerZoom } from '../lib/chartjs-setup.js'
// Ensure Chart.js base scales (including 'time') are registered before first render
try { registerBaseCharts() } catch {}
import { yDomainFor, yTickFormatterFor, timeTickFormatter, unitForMetric, formatValue, toDisplay, bucketForSpan } from '../lib/format.js'
import { format } from 'date-fns'
import { useUiStore } from '../state/filters.js'
import { useSettings, defaultSeriesColors } from '../state/settings.js'
import { useAssets } from '../state/assets.js'
import { robustZ, baselineByDOWHour, valueMinusBaseline } from '../lib/statsRobust.js'
// Import additional analysis utilities for derivatives and simple forecasts
import { computeDerivative, detectDerivativeAnomalies, linearForecast } from '../lib/analysisUtils.js'
import { useAnnotations } from '../state/annotations.js'
import { computeStats, toCsv, download } from '../lib/stats.js'
// Import helpers for JSON export
import { toJson, downloadText } from '../lib/exportUtils.js'
import { useAlerts } from '../state/alerts.js'
import { useAuth } from '../components/AuthProvider.jsx'
import { Line as ChartLine, Doughnut } from 'react-chartjs-2'

const COLOR_PICKER_CONFIG = [
  { key: 'U', label: 'U (V)' },
  { key: 'I', label: 'I (A)' },
  { key: 'P', label: 'P (W)' },
  { key: 'E', label: 'E (kWh)' },
  { key: 'pf', label: 'pf' },
  { key: 'F', label: 'F (Hz)' },
  { key: 'temp', label: 'Temp (C)' },
  { key: 'humid', label: 'Humid (%)' },
]
function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(37,99,235,${alpha})`
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const num = Number.parseInt(full, 16)
  if (!Number.isFinite(num)) return `rgba(37,99,235,${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r},${g},${b},${alpha})`
}
function Series({ deviceId, metricKey, from, to, bucketMs, valueMin, valueMax }) {
  const [points, setPoints] = useState([])
  useEffect(() => {
    let cancel = false
    const controller = new AbortController()
    async function run() {
      const span = to - from
      const requestedBucket = bucketMs ?? bucketForSpan(span, 60 * 1000)
      const effectiveBucket = Math.max(60 * 1000, requestedBucket)
      const res = await api.timeseries(deviceId, metricKey, { from, to, bucketMs: effectiveBucket, signal: controller.signal, timeoutMs: 15000 })
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
  const { options, getThreshold, seriesColors, setSeriesColor, resetSeriesColor } = useSettings()
  const { live, toggleLive } = useUiStore()
  // State used to force chart re-renders when resetting zoom
  const [resetKey, setResetKey] = useState(0)
  useEffect(()=>{ try { const s = localStorage.getItem('adv-view'); if (s==='1') setAdvancedView(true); const u = localStorage.getItem('adv-ultra'); if (u==='1') setUltraFine(true) } catch {} }, [])
  // Search params for drilldown metric
  const [searchParams] = useSearchParams()
  const from = anchorNow - period.ms
  const to = anchorNow
  const modalPanelRef = useRef(null)
  const [advancedView, setAdvancedView] = useState(false)
  const [ultraFine, setUltraFine] = useState(false)
  const colors = useMemo(() => COLOR_PICKER_CONFIG.reduce((acc, { key }) => {
    acc[key] = (seriesColors && seriesColors[key]) || defaultSeriesColors[key] || T.series.primary
    return acc
  }, {}), [seriesColors])

  // Hires series fetcher for enlarged charts (smaller bucket  more points)
  function useHiResSeries({ deviceId, metricKey, from, to, enabled, targetPoints = 800, minBucketMs = 60 * 1000 }) {
    const [pts, setPts] = useState([])
    useEffect(() => {
      let cancel = false
      const controller = new AbortController()
      async function run() {
        if (!enabled) { setPts([]); return }
        const bucketMs = Math.max(minBucketMs, Math.floor((to - from) / Math.max(10, targetPoints)))
        try {
          const res = await api.timeseries(deviceId, metricKey, { from, to, bucketMs, signal: controller.signal, timeoutMs: 20000 })
          const arr = (res.points || [])
          if (!cancel) setPts(arr)
        } catch {
          if (!cancel) setPts([])
        }
      }
      run();
      return () => { cancel = true; try { controller.abort() } catch {} }
    }, [deviceId, metricKey, from, to, enabled, targetPoints, minBucketMs])
    return pts
  }

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

  // Hires data only when modal is open (precision boost)
  const needUI = modal.open && modal.type === 'UI'
  const needP = modal.open && modal.type === 'P'
  const needPfF = modal.open && modal.type === 'pfF'
  const needTH = modal.open && modal.type === 'tH'
  const targetPts = advancedView ? (ultraFine ? 3000 : 1600) : 800
  const minBucket = 60 * 1000
  const U_hi = useHiResSeries({ deviceId: id, metricKey: 'U', from, to, enabled: needUI, targetPoints: targetPts, minBucketMs: minBucket })
  const I_hi = useHiResSeries({ deviceId: id, metricKey: 'I', from, to, enabled: needUI, targetPoints: targetPts, minBucketMs: minBucket })
  const P_hi = useHiResSeries({ deviceId: id, metricKey: 'P', from, to, enabled: needP, targetPoints: targetPts, minBucketMs: minBucket })
  const pf_hi = useHiResSeries({ deviceId: id, metricKey: 'pf', from, to, enabled: needPfF, targetPoints: targetPts, minBucketMs: minBucket })
  const F_hi = useHiResSeries({ deviceId: id, metricKey: 'F', from, to, enabled: needPfF, targetPoints: targetPts, minBucketMs: minBucket })
  const temp_hi = useHiResSeries({ deviceId: id, metricKey: 'temp', from, to, enabled: needTH, targetPoints: targetPts, minBucketMs: minBucket })
  const humid_hi = useHiResSeries({ deviceId: id, metricKey: 'humid', from, to, enabled: needTH, targetPoints: targetPts, minBucketMs: minBucket })
  
  // Chart.js advanced modal chart component
  function AdvancedModalChart({ id, series, thresholds, from, to, resetKey }) {
    const data = {
      datasets: series.map(s => ({
        label: s.label,
        data: (s.data||[]).map(p => ({ x: Number(p.ts), y: Number(p.value) })),
        borderColor: s.color,
        backgroundColor: s.color,
        pointRadius: 0,
        borderWidth: 1.2,
        tension: 0.25,
      })).concat(series.flatMap(s => {
        const th = thresholds[s.key] || {}
        const out = []
        if (Number.isFinite(th.warn)) out.push({
          label: `${s.label} warn`, borderColor: '#f59e0b', borderDash: [4,2], pointRadius:0, parsing:false,
          data: [{ x: from, y: th.warn }, { x: to, y: th.warn }], showLine: true,
        })
        if (Number.isFinite(th.crit)) out.push({
          label: `${s.label} crit`, borderColor: '#ef4444', borderDash: [4,2], pointRadius:0, parsing:false,
          data: [{ x: from, y: th.crit }, { x: to, y: th.crit }], showLine: true,
        })
        return out
      })),
    }
    const options = {
      parsing: false,
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'time', ticks: { maxTicksLimit: 12 } },
        y: { ticks: { maxTicksLimit: 10 } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { intersect: false, mode: 'index' },
        zoom: { zoom: { wheel: { enabled: true }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } },
        decimation: { enabled: true, algorithm: 'min-max' },
      },
    }
    return (
      <div style={{position:'relative', width:'100%', height:'100%'}}>
        <ChartLine key={String(resetKey||0)} data={data} options={options} />
      </div>
    )
  }

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
  const timeFmt = timeTickFormatter(from, to)
  const stat = {
    U: computeStats(U), I: computeStats(I), P: computeStats(P), E: computeStats(Eser), F: computeStats(F), 
    pf: computeStats(pf), temp: computeStats(temp), humid: computeStats(humid)
  }
  const hasUIData = (U && U.length > 0) || (I && I.length > 0)
  const [effTh, setEffTh] = useState(null)
  useEffect(()=>{ (async()=>{ try{ const r=await api.thresholdsEffective(id); setEffTh(r.thresholds||null) }catch{ setEffTh(null) } })() }, [id])
  useEffect(()=>{ if (modal.open && advancedView) { try { registerBaseCharts(); registerZoom() } catch {} } }, [modal.open, advancedView])
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
        if (lvl === 'crit' && hasRole('admin')) {
          import('../services/api.js').then(({ api })=>{
            api.notify(alert).catch(()=>{})
          })
        }
      }
    }
  }, [U,I,P,F,pf,temp,humid])

  // Baseline & anomalies (for P)
  const [baselineSeries, setBaselineSeries] = useState([])
  const [baselineMap, setBaselineMap] = useState({U:[], I:[], F:[], pf:[], temp:[], humid:[]})
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

    useEffect(() => {
    let cancel = false

    async function run() {
      try {
        // Si l’option baseline est désactivée, on nettoie et on sort
        if (!options.showBaseline) {
          if (!cancel) setBaselineMap({ U: [], I: [] })
          return
        }

        const end = anchorNow
        const start = anchorNow - 28 * 24 * 60 * 60 * 1000 // 4 semaines d’historique
        const bucketMs = 60 * 60 * 1000 // 1 h

        const [histU, histI] = await Promise.all([
          api.timeseries(id, 'U', { from: start, to: end, bucketMs }),
          api.timeseries(id, 'I', { from: start, to: end, bucketMs }),
        ])

        const pointsU = (histU.points || []).map(p => ({ ts: p.ts, value: Number(p.value) }))
        const pointsI = (histI.points || []).map(p => ({ ts: p.ts, value: Number(p.value) }))

        // Pas d’historique → pas de baseline, on ne casse pas l’UI
        if (!pointsU.length && !pointsI.length) {
          if (!cancel) setBaselineMap({ U: [], I: [] })
          return
        }

        const gridU = pointsU.length ? baselineByDOWHour(pointsU) : null
        const gridI = pointsI.length ? baselineByDOWHour(pointsI) : null

        const U_bl = (U || []).map(p => {
          const d = new Date(p.ts)
          const b = gridU ? gridU[d.getDay()]?.[d.getHours()] : undefined
          return { ts: p.ts, value: Number.isFinite(b) ? b : undefined }
        }).filter(p => p.value !== undefined)

        const I_bl = (I || []).map(p => {
          const d = new Date(p.ts)
          const b = gridI ? gridI[d.getDay()]?.[d.getHours()] : undefined
          return { ts: p.ts, value: Number.isFinite(b) ? b : undefined }
        }).filter(p => p.value !== undefined)

        if (!cancel) setBaselineMap({ U: U_bl, I: I_bl })
      } catch {
        // En cas d’erreur (ex: Kienlab 404), on désactive juste la baseline
        if (!cancel) setBaselineMap({ U: [], I: [] })
      }
    }

    run()
    return () => { cancel = true }
  }, [id, anchorNow, period.ms, options.showBaseline, U, I])


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
        const payload = await api.quality({ from, to, bucketMs, detail: '1' })
        if (!payload || !Array.isArray(payload.items)) return
        const rows = payload.items.filter(row => row.deviceId===id)
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
  // Tuile KPI rutilisable avec mini-sparkline (thme clair)
  function KpiTile({ title, value, unit, color, data = [], onClick }) {
    const merged = merge(data)
    const seriesValues = merged.map((p) => Number(p.value)).filter(Number.isFinite)
    const last = Number.isFinite(value) ? value : (seriesValues.at(-1) ?? null)
    const minVal = seriesValues.length ? Math.min(...seriesValues) : Number.isFinite(last) ? last : 0
    const maxVal = seriesValues.length ? Math.max(...seriesValues) : Number.isFinite(last) ? last : 0
    let percent = 0
    if (Number.isFinite(last)) percent = maxVal > minVal ? (last - minVal) / (maxVal - minVal) : 1
    percent = Math.min(Math.max(percent, 0), 1)
    const baseColor = color || '#2563eb'
    const donutData = useMemo(() => ({
      datasets: [{
        data: [Math.round(percent * 100), 100 - Math.round(percent * 100)],
        backgroundColor: [baseColor, hexToRgba(baseColor, 0.18)],
        borderWidth: 0,
        cutout: '72%',
      }],
    }), [percent, baseColor])
    const donutOptions = useMemo(() => ({
      animation: false,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    }), [])
    return (
      <DetailTile
        title="Voltage & Current"
        colorClass="blue"
        onOpen={()=>setModal({ type:'UI', open:true })}
      >
        <div className="tile-chart detail-chart">
          {hasUIData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={mergeTwo(U, I, 'U', 'I')}
                syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }}
                onMouseLeave={()=>clearHover()}
              >
                <defs>
                  <linearGradient id="gradU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.U} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.U} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.I} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.I} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} tickCount={12} minTickGap={12} />
                <YAxis
                  yAxisId={0}
                  stroke={T.axis}
                  domain={yDomainFor('U', merge(U))}
                  tickCount={8}
                  allowDecimals
                  tickFormatter={yTickFormatterFor('U')}
                />
                <YAxis
                  yAxisId={1}
                  orientation="right"
                  stroke={T.axis}
                  domain={yDomainFor('I', merge(I))}
                  tickCount={8}
                  allowDecimals
                  tickFormatter={yTickFormatterFor('I')}
                />
                <Tooltip
                  labelFormatter={(v)=>new Date(v).toLocaleString()}
                  formatter={(val, name)=>{
                    const v = Number(val)
                    const tx = name==='U'? thresholds.U : thresholds.I
                    if (!tx) return [v, name]
                    const dir = tx.direction || 'above'
                    let delta = ''
                    if (dir==='above') {
                      if (tx.crit!=null && v>=tx.crit) delta = ` (+${(v-tx.crit).toFixed(1)})`
                      else if (tx.warn!=null && v>=tx.warn) delta = ` (+${(v-tx.warn).toFixed(1)})`
                    } else {
                      if (tx.crit!=null && v<=tx.crit) delta = ` (${(v-tx.crit).toFixed(1)})`
                      else if (tx.warn!=null && v<=tx.warn) delta = ` (${(v-tx.warn).toFixed(1)})`
                    }
                    return [formatValue(name, v), `${name}${delta}`]
                  }}
                />
                {(missingMap.U||[]).map((g,i)=> (
                  <ReferenceArea key={'mu'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                ))}
                {(missingMap.I||[]).map((g,i)=> (
                  <ReferenceArea key={'mi'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                ))}
                {Number.isFinite(thresholds.U?.warn) && Number.isFinite(thresholds.U?.crit) && (
                  <ReferenceArea
                    yAxisId={0}
                    y1={Math.min(thresholds.U.warn, thresholds.U.crit)}
                    y2={Math.max(thresholds.U.warn, thresholds.U.crit)}
                    strokeOpacity={0}
                    fill="#f59e0b"
                    fillOpacity={0.06}
                  />
                )}
                {Number.isFinite(thresholds.U?.crit) && (
                  <ReferenceArea
                    yAxisId={0}
                    y1={thresholds.U.crit}
                    y2={(stat.U.max||thresholds.U.crit)}
                    strokeOpacity={0}
                    fill="#ef4444"
                    fillOpacity={0.06}
                  />
                )}
                {hoverTs && <ReferenceLine x={hoverTs} stroke={T.brush} strokeDasharray="3 3" />}
                <ReferenceLine y={thresholds.U?.warn??null} stroke={T.series.warning} strokeDasharray="4 2" />
                <ReferenceLine y={thresholds.U?.crit??null} stroke={T.series.danger} strokeDasharray="4 2" />
                <Area
                  type="monotone"
                  yAxisId={0}
                  dataKey="U"
                  stroke={colors.U}
                  fill="url(#gradU)"
                  fillOpacity={1}
                  dot={false}
                  name="U"
                />
                <Area
                  type="monotone"
                  yAxisId={1}
                  dataKey="I"
                  stroke={colors.I}
                  fill="url(#gradI)"
                  fillOpacity={1}
                  dot={false}
                  name="I"
                />
                {options.showBaseline && baselineMap.U.length > 0 && (
                  <Line
                    type="monotone"
                    yAxisId={0}
                    data={baselineMap.U}
                    dataKey="value"
                    stroke={T.series.gray}
                    dot={false}
                    strokeDasharray="4 3"
                  />
                )}
                {options.showBaseline && baselineMap.I.length > 0 && (
                  <Line
                    type="monotone"
                    yAxisId={1}
                    data={baselineMap.I}
                    dataKey="value"
                    stroke={T.series.gray}
                    dot={false}
                    strokeDasharray="4 3"
                  />
                )}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data-message">
              Aucune donnée disponible sur la période pour la tension et le courant.
            </div>
          )}
        </div>
        <TileKpiRow
          items={[
            { label: 'U last', value: Number.isFinite(stat.U.last) ? `${stat.U.last.toFixed(2)} V` : '--' },
            { label: 'I last', value: Number.isFinite(stat.I.last) ? `${stat.I.last.toFixed(2)} A` : '--' },
            { label: 'U avg', value: Number.isFinite(stat.U.avg) ? `${stat.U.avg.toFixed(2)} V` : '--' },
            { label: 'I avg', value: Number.isFinite(stat.I.avg) ? `${stat.I.avg.toFixed(2)} A` : '--' },
          ]}
        />
      </DetailTile>

    )
  }

  function DetailTile({ title, subtitle, colorClass = 'neutral', subStyle, subClassName  ,onOpen, children }) {
    const handleKey = (e) => {
      if (!onOpen) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    }
    return (
      <div
        className="tile-card detail-tile"
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={handleKey}
        style={onOpen ? { cursor: 'zoom-in' } : undefined}
      >
        <div className="tile-head">
          <div>
            <h3 className="tile-title">{title}</h3>
            {subtitle && <div className="tile-subtitle">{subtitle}</div>}
          </div>
        </div>
        <div className="tile-body">
          <div className={`tile-sub ${colorClass} ${subClassName}`.trim()} style={subStyle}>
            {children}
          </div>
        </div>
        
      </div>
      
    )
  }

  function TileKpiRow({ items }) {
    if (!items || !items.length) return null
    return (
      <div className="tile-mini-kpis">
        {items.map((item, idx) => (
          <div key={idx} className="item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    )
  }
  const modalTileMeta = useMemo(() => ({
    UI: {
      title: 'Voltage & Current',
      colorClass: 'blue',
      kpis: [
        { label: 'U avg', value: Number.isFinite(stat.U.avg) ? `${stat.U.avg.toFixed(2)} V` : '--' },
        { label: 'I avg', value: Number.isFinite(stat.I.avg) ? `${stat.I.avg.toFixed(2)} A` : '--' },
        { label: 'U max', value: Number.isFinite(stat.U.max) ? `${stat.U.max.toFixed(2)} V` : '--' },
        { label: 'I max', value: Number.isFinite(stat.I.max) ? `${stat.I.max.toFixed(2)} A` : '--' },
      ],
    },
    pfF: {
      title: 'Power Factor & Frequency',
      colorClass: 'violet',
      kpis: [
        { label: 'pf avg', value: Number.isFinite(stat.pf.avg) ? stat.pf.avg.toFixed(3) : '--' },
        { label: 'F avg', value: Number.isFinite(stat.F.avg) ? `${stat.F.avg.toFixed(2)} Hz` : '--' },
        { label: 'pf min', value: Number.isFinite(stat.pf.min) ? stat.pf.min.toFixed(3) : '--' },
      ],
    },
    P: {
      title: 'Power (W)',
      colorClass: 'amber',
      kpis: [
        { label: 'Last', value: Number.isFinite(stat.P.last) ? `${toDisplay('P', stat.P.last).toFixed(1)} ${unitForMetric('P')}` : '--' },
        { label: 'Avg', value: Number.isFinite(stat.P.avg) ? `${toDisplay('P', stat.P.avg).toFixed(1)} ${unitForMetric('P')}` : '--' },
        { label: 'Min/Max', value: Number.isFinite(stat.P.min) && Number.isFinite(stat.P.max)
          ? `${toDisplay('P', stat.P.min).toFixed(1)} / ${toDisplay('P', stat.P.max).toFixed(1)} ${unitForMetric('P')}`
          : '--' },
      ],
    },
  }), [stat])

  const activeModalMeta = modal.open ? modalTileMeta[modal.type] : null

  const renderModalChart = () => {
    if (modal.type === 'UI') {
      if (advancedView) {
        return (
          <AdvancedModalChart
            id="ui"
            series={[
              { key: 'U', label: 'U', color: colors.U, data: (U_hi.length ? U_hi : U) },
              { key: 'I', label: 'I', color: colors.I, data: (I_hi.length ? I_hi : I) },
            ]}
            thresholds={thresholds}
            from={from}
            to={to}
            resetKey={resetKey}
          />
        )
      }
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart key={resetKey} data={mergeTwo((U_hi.length ? U_hi : U), (I_hi.length ? I_hi : I), 'U', 'I')}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} minTickGap={10} tickCount={12}/>
            <YAxis yAxisId={0} stroke={T.axis} tickCount={10} domain={yDomainFor('U', merge(U))} tickFormatter={yTickFormatterFor('U')} allowDecimals />
            <YAxis yAxisId={1} orientation="right" stroke={T.axis} tickCount={10} domain={yDomainFor('I', merge(I))} tickFormatter={yTickFormatterFor('I')} allowDecimals />
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>[formatValue(name, val), name]} />
            <ReferenceLine y={thresholds.U?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
            <ReferenceLine y={thresholds.U?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
            <ReferenceLine yAxisId={1} y={thresholds.I?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
            <ReferenceLine yAxisId={1} y={thresholds.I?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
            <Line type="monotone" yAxisId={0} dataKey="U" stroke={colors.U} dot={false} connectNulls />
            <Line type="monotone" yAxisId={1} dataKey="I" stroke={colors.I} dot={false} connectNulls />
            <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
          </LineChart>
        </ResponsiveContainer>
      )
    }
    if (modal.type === 'P') {
      if (advancedView) {
        return (
          <AdvancedModalChart
            id="p"
            series={[{ key: 'P', label: 'P', color: colors.P, data: (P_hi.length ? P_hi : P) }]}
            thresholds={thresholds}
            from={from}
            to={to}
            resetKey={resetKey}
          />
        )
      }
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={merge(P_hi.length ? P_hi : P)}>
            <defs>
              <linearGradient id="modalGradP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.P} stopOpacity={0.6} />
                <stop offset="100%" stopColor={colors.P} stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} minTickGap={10} tickCount={12}/>
            <YAxis stroke={T.axis} tickCount={10} domain={yDomainFor('P', merge(P))} tickFormatter={yTickFormatterFor('P')} allowDecimals />
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val)=>[formatValue('P', val), unitForMetric('P')]} />
            <ReferenceLine y={thresholds.P?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
            <ReferenceLine y={thresholds.P?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
            <Bar dataKey="value" name="P" fill="url(#modalGradP)" />
            <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
          </BarChart>
        </ResponsiveContainer>
      )
    }
    if (modal.type === 'pfF') {
      if (advancedView) {
        return (
          <AdvancedModalChart
            id="pfF"
            series={[
              { key: 'pf', label: 'pf', color: colors.pf, data: (pf_hi.length ? pf_hi : pf) },
              { key: 'F', label: 'F', color: colors.F, data: (F_hi.length ? F_hi : F) },
            ]}
            thresholds={thresholds}
            from={from}
            to={to}
            resetKey={resetKey}
          />
        )
      }
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergeTwo((pf_hi.length ? pf_hi : pf), (F_hi.length ? F_hi : F), 'pf', 'F')}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} minTickGap={10} tickCount={12}/>
            <YAxis yAxisId={0} stroke={T.axis} tickCount={10} domain={yDomainFor('pf', merge(pf))} tickFormatter={yTickFormatterFor('pf')} allowDecimals />
            <YAxis yAxisId={1} orientation="right" stroke={T.axis} tickCount={10} domain={yDomainFor('F', merge(F))} tickFormatter={yTickFormatterFor('F')} allowDecimals />
            <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>[formatValue(name, val), name]} />
            <ReferenceLine yAxisId={0} y={thresholds.pf?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
            <ReferenceLine yAxisId={0} y={thresholds.pf?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
            <ReferenceLine yAxisId={1} y={thresholds.F?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
            <ReferenceLine yAxisId={1} y={thresholds.F?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
            <Area yAxisId={0} type="monotone" dataKey="pf" stroke={colors.pf} fill={colors.pf} fillOpacity={0.12} dot={false} />
            <Line yAxisId={1} type="monotone" dataKey="F" stroke={colors.F} dot={false} />
            <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
          </ComposedChart>
        </ResponsiveContainer>
      )
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart key={resetKey} data={mergeTwo((temp_hi.length ? temp_hi : temp), (humid_hi.length ? humid_hi : humid), 'temp', 'humid')}>
          <CartesianGrid stroke={T.grid} />
          <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} minTickGap={10} tickCount={12}/>
          <YAxis yAxisId={0} stroke={T.axis} tickCount={10} domain={yDomainFor('temp', merge(temp))} tickFormatter={yTickFormatterFor('temp')} allowDecimals />
          <YAxis yAxisId={1} orientation="right" stroke={T.axis} tickCount={10} domain={yDomainFor('humid', merge(humid))} tickFormatter={yTickFormatterFor('humid')} allowDecimals />
          <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>[formatValue(name, val), name]} />
          <ReferenceLine yAxisId={0} y={thresholds.temp?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
          <ReferenceLine yAxisId={0} y={thresholds.temp?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
          <ReferenceLine yAxisId={1} y={thresholds.humid?.warn ?? null} stroke={T.series.warning} strokeDasharray="4 2" />
          <ReferenceLine yAxisId={1} y={thresholds.humid?.crit ?? null} stroke={T.series.danger} strokeDasharray="4 2" />
          <Line type="monotone" yAxisId={0} dataKey="temp" stroke={colors.temp} dot={false} />
          <Line type="monotone" yAxisId={1} dataKey="humid" stroke={colors.humid} dot={false} />
          <Brush dataKey="ts" height={24} stroke={T.brush} travellerWidth={12} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div>
      <div className="panel" style={{marginBottom:12}}>
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="panel-title">{(meta[device.id]?.name)||device.name}</div>
            <div style={{color:'#6b7280'}}>{device.type}  {(meta[device.id]?.room)||device.room||'-'}</div>
          </div>
          <div className="row" style={{gap:8}}>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''} onClick={()=>download(`${id}_U.csv`, toCsv(U))}>Export U (CSV)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''} onClick={()=>download(`${id}_P.csv`, toCsv(P))}>Export P (CSV)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''}
              onClick={()=>{
                try {
                  const arr = pData.filter(p => !viewRange || (p.ts>=viewRange.fromTs && p.ts<=viewRange.toTs)).map(p=>({ ts:p.ts, value:p.value }))
                  download(`${id}_P_view.csv`, toCsv(arr))
                } catch {}
              }}>Export P (CSV, view)</button>
            {/* JSON export buttons */}
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''} onClick={() => { downloadText(`${id}_U.json`, toJson(U)) }}>Export U (JSON)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''} onClick={() => { downloadText(`${id}_P.json`, toJson(P)) }}>Export P (JSON)</button>
            <button className="btn" disabled={!hasRole('analyst')} title={!hasRole('analyst')? 'Requiert rle analyst':''}
              onClick={async()=>{
                try {
                  const res = await api.exportPdf(id, from, to, (meta[device.id]?.name)||device.name)
                  if (!res || !res.ok) { alert('PDF export not enabled on server'); return }
                  const blob = await res.blob(); const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = `${id}_report.pdf`; a.click(); URL.revokeObjectURL(url)
                } catch { /* ignore */ }
              }}>Export PDF</button>
            <button className={`btn ${live? 'primary':''}`} onClick={toggleLive}>{live? 'Live: ON':'Live: OFF'}</button>
            <Link to="/devices" className="btn">Back</Link>
          </div>
        </div>
        <div className="row" style={{flexWrap:'wrap', gap:12, marginTop:12}}>
          {COLOR_PICKER_CONFIG.map(({ key, label }) => (
            <div key={key} className="chip" style={{display:'flex', alignItems:'center', gap:8}}>
              <span>{label}</span>
              <input
                type="color"
                value={colors[key]}
                onChange={(e)=> setSeriesColor(key, e.target.value)}
                style={{width:32, height:24, border:'none', background:'transparent', cursor:'pointer', padding:0}}
                aria-label={`Couleur ${label}`}
              />
              <button type="button" className="btn" style={{padding:'2px 8px'}} onClick={()=> resetSeriesColor(key)} title="Reinitialiser la couleur">
                Reset
              </button>
            </div>
        ))}
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

      
      <div className="detail-grid">
        <DetailTile
          title="Voltage & Current"
          colorClass="blue"
          onOpen={()=>setModal({ type:'UI', open:true })}
        >
          <div className="tile-chart detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergeTwo(U, I, 'U', 'I')} syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                <defs>
                  <linearGradient id="gradU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.U} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.U} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.I} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={colors.I} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} tickCount={12} minTickGap={12} />
                <YAxis yAxisId={0} stroke={T.axis} domain={yDomainFor('U', merge(U))} tickCount={8} allowDecimals tickFormatter={yTickFormatterFor('U')} />
                <YAxis yAxisId={1} orientation="right" stroke={T.axis} domain={yDomainFor('I', merge(I))} tickCount={8} allowDecimals tickFormatter={yTickFormatterFor('I')} />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val, name)=>{
                  const v = Number(val)
                  const tx = name==='U'? thresholds.U : thresholds.I
                  if (!tx) return [v, name]
                  const dir = tx.direction || 'above'
                  let delta = ''
                  if (dir==='above') {
                    if (tx.crit!=null && v>=tx.crit) delta = ` (+${(v-tx.crit).toFixed(1)})`
                    else if (tx.warn!=null && v>=tx.warn) delta = ` (+${(v-tx.warn).toFixed(1)})`
                  } else {
                    if (tx.crit!=null && v<=tx.crit) delta = ` (${(v-tx.crit).toFixed(1)})`
                    else if (tx.warn!=null && v<=tx.warn) delta = ` (${(v-tx.warn).toFixed(1)})`
                  }
                  return [formatValue(name, v), `${name}${delta}`]
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
                <Area type="monotone" yAxisId={0} dataKey="U" stroke={colors.U} fill="url(#gradU)" fillOpacity={1} dot={false} name="U" />
                <Area type="monotone" yAxisId={1} dataKey="I" stroke={colors.I} fill="url(#gradI)" fillOpacity={1} dot={false} name="I" />
                {options.showBaseline && baselineMap.U.length>0 && <Line type="monotone" yAxisId={0} data={baselineMap.U} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                {options.showBaseline && baselineMap.I.length>0 && <Line type="monotone" yAxisId={1} data={baselineMap.I} dataKey="value" stroke={T.series.gray} dot={false} strokeDasharray="4 3" />}
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <TileKpiRow
            items={[
              { label: 'U last', value: Number.isFinite(stat.U.last) ? `${stat.U.last.toFixed(2)} V` : '--' },
              { label: 'I last', value: Number.isFinite(stat.I.last) ? `${stat.I.last.toFixed(2)} A` : '--' },
              { label: 'U avg', value: Number.isFinite(stat.U.avg) ? `${stat.U.avg.toFixed(2)} V` : '--' },
              { label: 'I avg', value: Number.isFinite(stat.I.avg) ? `${stat.I.avg.toFixed(2)} A` : '--' },
            ]}
          />
        </DetailTile>
        <KpiTile
          title="Temperature"
          value={stat.temp.last}
          unit="°C"
          color={colors.temp}
          data={temp}
          onClick={()=>setModal({ type:'tH', open:true })}
        />

        <DetailTile
          title="Power Factor & Frequency"
          colorClass="violet"
          onOpen={()=>setModal({ type:'pfF', open:true })}
        >
          <div className="tile-chart detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mergeTwo(pf, F, 'pf', 'F')} syncId={`dev-${id}`}>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} tickCount={12} minTickGap={12} />
                <YAxis yAxisId={0} stroke={T.axis} domain={yDomainFor('pf', merge(pf))} tickCount={8} allowDecimals tickFormatter={yTickFormatterFor('pf')} />
                <YAxis yAxisId={1} orientation="right" stroke={T.axis} domain={yDomainFor('F', merge(F))} tickCount={8} allowDecimals tickFormatter={yTickFormatterFor('F')} />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                {(missingMap.pf||[]).map((g,i)=> (<ReferenceArea key={'mpf'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {(missingMap.F||[]).map((g,i)=> (<ReferenceArea key={'mf'+i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />))}
                {Number.isFinite(thresholds.pf?.crit) && (
                  <ReferenceArea yAxisId={0} y1={0} y2={thresholds.pf.crit} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.pf?.warn) && Number.isFinite(thresholds.pf?.crit) && thresholds.pf.warn>thresholds.pf.crit && (
                  <ReferenceArea yAxisId={0} y1={thresholds.pf.crit} y2={thresholds.pf.warn} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.F?.warn) && Number.isFinite(thresholds.F?.crit) && (
                  <ReferenceArea yAxisId={1} y1={Math.min(thresholds.F.warn, thresholds.F.crit)} y2={Math.max(thresholds.F.warn, thresholds.F.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                <Area yAxisId={0} type="monotone" dataKey="pf" stroke={colors.pf} fill={colors.pf} fillOpacity={0.12} dot={false} name="pf" />
                <Line yAxisId={1} type="monotone" dataKey="F" stroke={colors.F} dot={false} name="F" />
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <TileKpiRow
            items={[
              { label: 'pf avg', value: Number.isFinite(stat.pf.avg) ? stat.pf.avg.toFixed(3) : '--' },
              { label: 'F avg', value: Number.isFinite(stat.F.avg) ? `${stat.F.avg.toFixed(2)} Hz` : '--' },
              { label: 'pf min', value: Number.isFinite(stat.pf.min) ? stat.pf.min.toFixed(3) : '--' },
            ]}
          />
        </DetailTile>
        <KpiTile
          title="Humidity"
          value={stat.humid.last}
          unit="%"
          color={colors.humid}
          data={humid}
          onClick={()=>setModal({ type:'tH', open:true })}
        />

        <DetailTile
          title="Power (W)"
          colorClass="amber"
          onOpen={()=>setModal({ type:'P', open:true })}
        >
          <div className="tile-chart detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merge(P)} syncId={`dev-${id}`}
                onMouseMove={(e)=>{ const ts = e && e.activeLabel; if (ts) setHoverTs(ts) }} onMouseLeave={()=>clearHover()}>
                <defs>
                  <linearGradient id="gradP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.P} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={colors.P} stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.grid} />
                <XAxis dataKey="ts" tickFormatter={timeFmt} stroke={T.axis} tickCount={12} minTickGap={12} />
                <YAxis stroke={T.axis} domain={yDomainFor('P', merge(P))} tickCount={10} allowDecimals tickFormatter={yTickFormatterFor('P')} />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val)=>[formatValue('P', val), unitForMetric('P')]} />
                {(missingMap.P||[]).map((g,i)=> (<ReferenceArea key={i} x1={g.x1} x2={g.x2} strokeOpacity={0} fill="#ef4444" fillOpacity={0.08} />))}
                {Number.isFinite(thresholds.P?.warn) && Number.isFinite(thresholds.P?.crit) && (
                  <ReferenceArea y1={Math.min(thresholds.P.warn, thresholds.P.crit)} y2={Math.max(thresholds.P.warn, thresholds.P.crit)} strokeOpacity={0} fill="#f59e0b" fillOpacity={0.06} />
                )}
                {Number.isFinite(thresholds.P?.crit) && (
                  <ReferenceArea y1={thresholds.P.crit} y2={(stat.P.max||thresholds.P.crit)} strokeOpacity={0} fill="#ef4444" fillOpacity={0.06} />
                )}
                <ReferenceLine y={thresholds.P?.warn??null} stroke={T.series.warning} strokeDasharray="4 2" />
                <ReferenceLine y={thresholds.P?.crit??null} stroke={T.series.danger} strokeDasharray="4 2" />
                <Bar dataKey="value" name="P" fill="url(#gradP)" />
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} onChange={onPBrushChange} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TileKpiRow
            items={[
              { label: 'Last', value: Number.isFinite(stat.P.last) ? `${toDisplay('P', stat.P.last).toFixed(1)} ${unitForMetric('P')}` : '--' },
              { label: 'Avg', value: Number.isFinite(stat.P.avg) ? `${toDisplay('P', stat.P.avg).toFixed(1)} ${unitForMetric('P')}` : '--' },
              { label: 'Min/Max', value: Number.isFinite(stat.P.min) && Number.isFinite(stat.P.max) ? `${toDisplay('P', stat.P.min).toFixed(1)} / ${toDisplay('P', stat.P.max).toFixed(1)} ${unitForMetric('P')}` : '--' },
            ]}
          />
        </DetailTile>

        <DetailTile title="Energy (kWh)" colorClass="neutral">
          <div className="tile-chart detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merge(Eser)} syncId={`dev-${id}`}>
                <CartesianGrid stroke={T.grid} />
                <YAxis stroke={T.axis} tickCount={10} allowDecimals domain={yDomainFor('E', merge(Eser))} tickFormatter={yTickFormatterFor('E')} />
                <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} formatter={(val)=>[formatValue('E', val), unitForMetric('E')]} />
                <Line type="monotone" dataKey="value" stroke={colors.E} dot={false} name="E" />
                <Brush dataKey="ts" height={20} stroke={T.brush} travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <TileKpiRow
            items={[
              { label: 'Last', value: Number.isFinite(stat.E.last) ? `${toDisplay('E', stat.E.last).toFixed(1)} ${unitForMetric('E')}` : '--' },
            ]}
          />
        </DetailTile>
      </div>
      {modal.open && (
        <div
          className="detail-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={()=>setModal({open:false})}
          onKeyDown={(e)=>{ if (e.key==='Escape') setModal({open:false}) }}
        >
          <div
            className="detail-modal-card"
            onClick={(e)=>e.stopPropagation()}
            tabIndex={0}
            id="device-modal-panel"
          >
            <div className="detail-modal-header">
              <div className="detail-modal-tags">
                {advancedView && <span className="badge">Analyse avancée</span>}
                <span className="badge">Granularité: {
                  modal.type==='UI' ? ((U_hi.length? Math.floor((to-from)/Math.max(1,U_hi.length)) : (options.bucketMs || Math.floor((to-from)/200))))
                  : modal.type==='P' ? ((P_hi.length? Math.floor((to-from)/Math.max(1,P_hi.length)) : (options.bucketMs || Math.floor((to-from)/200))))
                  : modal.type==='pfF' ? ((pf_hi.length? Math.floor((to-from)/Math.max(1,pf_hi.length)) : (options.bucketMs || Math.floor((to-from)/200))))
                  : ((temp_hi.length? Math.floor((to-from)/Math.max(1,temp_hi.length)) : (options.bucketMs || Math.floor((to-from)/200))))
                } ms</span>
                {advancedView && (<span className="badge">{ultraFine ? 'Ultra fin' : 'Standard'}</span>)}
              </div>
              <div className="detail-modal-actions">
                <button className="btn" onClick={() => setResetKey(k => k + 1)}>Reset zoom</button>
                <button
                  className={`btn ${advancedView ? 'primary' : ''}`}
                  onClick={() => setAdvancedView(v => {
                    try { localStorage.setItem('adv-view', (!v) ? '1' : '0') } catch {}
                    if (v === false) {
                      try { const ultra = localStorage.getItem('adv-ultra'); setUltraFine(ultra === '1') } catch {}
                    }
                    return !v
                  })}
                  title="Affiche la courbe avec une granularité plus fine"
                >
                  Analyse avancée
                </button>
                {advancedView && (
                  <button
                    className={`btn ${ultraFine ? 'primary' : ''}`}
                    onClick={() => setUltraFine(u => {
                      try { localStorage.setItem('adv-ultra', (!u) ? '1' : '0') } catch {}
                      return !u
                    })}
                    title="Encore plus de points (min bucket ≈ 250ms)"
                  >
                    Ultra fin
                  </button>
                )}
                <button className="btn" onClick={()=>setModal({open:false})}>Fermer</button>
              </div>
            </div>
            <div className="detail-modal-body">
              <div className={`tile-sub ${(activeModalMeta && activeModalMeta.colorClass) || 'neutral'}`}>
                <div className="tile-chart detail-chart">
                  {renderModalChart()}
                </div>
                {activeModalMeta && <TileKpiRow items={activeModalMeta.kpis} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
