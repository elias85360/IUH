import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
  BarChart, Bar
} from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import SkeletonBox from './SkeletonBox.jsx'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { computeStats } from '../lib/stats.js'
import { format } from 'date-fns'
import { useSettings } from '../state/settings.js'

export default function DeviceSummaryCard({ device }) {
  const { anchorNow, period } = useUiStore()
  const { meta } = useAssets()
  const { getThreshold } = useSettings()

  const m = meta[device.id] || {}
  const name = m.name || device.name
  const room = m.room || device.room || '—'
  const desc  = m.description || ''
  const tags  = m.tags || device.tags || []

  const from = anchorNow - period.ms
  const to   = anchorNow

  const [series, setSeries] = useState({ P: [], U: [], temp: [], pf: [], E: [] })
  const [effTh, setEffTh] = useState(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const r = await api.thresholdsEffective(device.id)
        if (!cancel) setEffTh(r.thresholds || null)
      } catch {}
    })()
    return () => { cancel = true }
  }, [device.id])

  useEffect(() => {
    let cancel=false
    async function run(){
      const bucket = Math.max(60*1000, Math.floor((to-from)/160))
      const [p,u,t,pf,e] = await Promise.all([
        api.timeseries(device.id, 'P',   { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'U',   { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'temp',{ from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'pf',  { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'E',   { from, to, bucketMs: 60*60*1000 }),
      ])
      const toPoints = (arr=[]) =>
        arr.map(pt=>({ ts:Number(pt.ts), value:Number(pt.value) }))
           .filter(pt=>Number.isFinite(pt.ts) && Number.isFinite(pt.value))
      const toKwh = (arr=[]) =>
        arr.map(pt=>({ ts:Number(pt.ts), value:Number(pt.sum||pt.value||0)/1000 }))
           .filter(pt=>Number.isFinite(pt.ts) && Number.isFinite(pt.value))
      if (!cancel) setSeries({
        P: toPoints(p.points),
        U: toPoints(u.points),
        temp: toPoints(t.points),
        pf: toPoints(pf.points),
        E: toKwh(e.points),
      })
    }
    run(); return ()=>{ cancel=true }
  }, [device.id, from, to])

  const statsP = computeStats(series.P)
  const fmtHm = (ts) => format(new Date(ts), 'HH:mm')
  const lastTs = series.P.length ? series.P[series.P.length-1].ts : null
  const ageMs = lastTs ? (anchorNow - lastTs) : null
  function fmtAge(ms){
    if (ms==null) return '—'
    const s=Math.floor(ms/1000); if (s<60) return s+'s'
    const m=Math.floor(s/60);    if (m<60) return m+'m'
    const h=Math.floor(m/60);    return h+'h'
  }

  // Levels
  const latest = {
    P:    series.P.at(-1)?.value ?? null,
    U:    series.U.at(-1)?.value ?? null,
    temp: series.temp.at(-1)?.value ?? null,
    pf:   series.pf.at(-1)?.value ?? null,
  }
  function levelFor(metric, value){
    if (value==null) return 'ok'
    const th = (effTh && effTh[metric]) || getThreshold(device.id, metric) || {}
    if (metric==='pf' && th?.direction==='below'){
      if (th.crit!=null && value<=th.crit) return 'crit'
      if (th.warn!=null && value<=th.warn) return 'warn'
      return 'ok'
    }
    if (th.crit!=null && value>=th.crit) return 'crit'
    if (th.warn!=null && value>=th.warn) return 'warn'
    return 'ok'
  }
  const levels = {
    P: levelFor('P', latest.P),
    U: levelFor('U', latest.U),
    temp: levelFor('temp', latest.temp),
    pf: levelFor('pf', latest.pf),
  }
  const overall = ['crit','warn','ok'].find(l => Object.values(levels).includes(l)) || 'ok'
  const freshnessClass = ageMs==null ? '' : (ageMs>6*60*60*1000 ? 'crit' : (ageMs>60*60*1000 ? 'warn' : 'ok'))

  // ---- UI (compact card) ---------------------------------------------------
  return (
    <div className="card-v2 device-card" style={{height:'100%'}}>
      {/* HEADER */}
      <div className="card-head">
        <div className="row" style={{gap:10, alignItems:'center', minWidth:0}}>
          <div className="device-avatar" style={{width:42, height:42, margin:0}} />
          <div style={{minWidth:0}}>
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <span className="card-title" style={{fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                {name}
              </span>
              <span className={`status-chip ${overall}`}>{overall.toUpperCase()}</span>
            </div>
            <div className="row" style={{gap:6, marginTop:4, alignItems:'center'}}>
              <span className="chip">{room}</span>
              <span className={`status-chip ${freshnessClass}`} title="Freshness (P)">
                {fmtAge(ageMs)}
              </span>
            </div>
          </div>
        </div>
        <Link to={`/devices/${encodeURIComponent(device.id)}`} className="btn">Details</Link>
      </div>

      {/* BODY */}
      <div className="card-body" style={{display:'grid', gap:12}}>
        {/* Tags (si présents) */}
        {tags && tags.length>0 && (
          <div className="device-tags" style={{marginTop:-4}}>
            {tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {/* KPIs Power */}
        <div className="kpi" style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <div className="item">P50 <strong>{statsP.avg?.toFixed?.(0) ?? '—'}</strong></div>
          <div className="item">P95 <strong>{Number.isFinite(statsP.max) ? statsP.max.toFixed(0) : '—'}</strong></div>
          <div className="item">P05 <strong>{Number.isFinite(statsP.min) ? statsP.min.toFixed(0) : '—'}</strong></div>
          <div className="item">Type <strong>{device.type}</strong></div>
          <div className="item" title={device.id}>ID <strong>{String(device.id).slice(0,8)}…</strong></div>
        </div>

        {/* Power timeseries */}
        <div>
          <div className="section-title">Power (W)</div>
          <div style={{height:110}}>
            {series.P && series.P.length>0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.P}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tick={{fontSize:10}} tickFormatter={fmtHm} stroke={T.axis}/>
                  <YAxis stroke={T.axis} tick={{fontSize:10}}
                         domain={[
                           dataMin=> (Number.isFinite(dataMin)? dataMin-1: 0),
                           dataMax=> (Number.isFinite(dataMax)? dataMax+1: 1)
                         ]}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke={T.series.warning} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <SkeletonBox height={110} />
            )}
          </div>
        </div>

        {/* 3 mini cartes U / Temp / PF */}
        <div className="device-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
          <div className="small-card">
            <div className={`section-title ${levels.U}`}>Voltage (V)</div>
            <div style={{height:78}}>
              {series.U && series.U.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.U}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis}/>
                    <YAxis hide stroke={T.axis} domain={['auto','auto']} />
                    <Line type="monotone" dataKey="value" stroke={T.series.purple} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <SkeletonBox height={78} /> }
            </div>
          </div>

          <div className="small-card">
            <div className={`section-title ${levels.temp}`}>Temperature (°C)</div>
            <div style={{height:78}}>
              {series.temp && series.temp.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.temp}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis}/>
                    <YAxis hide stroke={T.axis} domain={['auto','auto']} />
                    <Line type="monotone" dataKey="value" stroke={T.series.danger} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <SkeletonBox height={78} /> }
            </div>
          </div>

          <div className="small-card">
            <div className={`section-title ${levels.pf}`}>Power Factor</div>
            <div style={{height:78}}>
              {series.pf && series.pf.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.pf}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis}/>
                    <YAxis hide stroke={T.axis} domain={[0,1]} />
                    <Line type="monotone" dataKey="value" stroke={T.series.secondary} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <SkeletonBox height={78} /> }
            </div>
          </div>
        </div>

        {/* Energy by hour */}
        <div>
          <div className="section-title">Energy by hour (kWh)</div>
          <div style={{height:110}}>
            {series.E && series.E.length>0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.E}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tick={{fontSize:10}} tickFormatter={(v)=>format(new Date(v),'HH:mm')} stroke={T.axis}/>
                  <YAxis stroke={T.axis} tick={{fontSize:10}}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Bar dataKey="value" fill={T.series.blue} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <SkeletonBox height={110} />
            )}
          </div>
        </div>

        {/* Description courte */}
        {desc && <div className="device-desc" style={{marginTop:2}}>{desc}</div>}
      </div>
    </div>
  )
}
