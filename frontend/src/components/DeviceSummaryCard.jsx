import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'
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
  const m = meta[device.id] || {}
  const name = m.name || device.name
  const room = m.room || device.room || '—' 
  const desc = m.description || ''
  const tags = m.tags || device.tags || []

  const from = anchorNow - period.ms
  const to = anchorNow
  const [series, setSeries] = useState({ P: [], U: [], temp: [], pf: [], E: [] })
  const { getThreshold } = useSettings()

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucket = Math.max(60*1000, Math.floor((to-from)/160))
      const [p,u,t,pf,e] = await Promise.all([
        api.timeseries(device.id, 'P', { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'U', { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'temp', { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'pf', { from, to, bucketMs: bucket }),
        api.timeseries(device.id, 'E', { from, to, bucketMs: 60*60*1000 }),
      ])
      const toPoints = (arr) => (arr||[])
        .map(pt=>({ ts: Number(pt.ts), value: Number(pt.value) }))
        .filter(pt => Number.isFinite(pt.ts) && Number.isFinite(pt.value))
      const toKwh = (arr) => (arr||[])
        .map(pt=>({ ts: Number(pt.ts), value: Number(pt.sum||pt.value||0)/1000 }))
        .filter(pt => Number.isFinite(pt.ts) && Number.isFinite(pt.value))
      if (!cancel) setSeries({
        P: toPoints(p.points),
        U: toPoints(u.points),
        temp: toPoints(t.points),
        pf: toPoints(pf.points),
        E: toKwh(e.points),
      })
    }
    run()
    return ()=>{ cancel=true }
  }, [device.id, from, to])

  const statsP = computeStats(series.P)
  const fmt = (ts) => format(new Date(ts), 'HH:mm')

  // Compute latest values and levels
  const latest = {
    P: series.P.length? series.P[series.P.length-1].value : null,
    U: series.U.length? series.U[series.U.length-1].value : null,
    temp: series.temp.length? series.temp[series.temp.length-1].value : null,
    pf: series.pf.length? series.pf[series.pf.length-1].value : null,
  }
  function levelFor(metric, value){
    if (value==null) return 'ok'
    const th = getThreshold(device.id, metric) || {}
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

  return (
    <div className="panel device-summary">
      <div className="device-left">
        <div className="device-avatar"/>
        <div className="device-name" style={{display:'flex', alignItems:'center', gap:8}}>
          <span>{name}</span>
          <span className={`status-chip ${overall}`}>{overall.toUpperCase()}</span>
        </div>
        <div className="device-room">{room}</div>
        <div className="device-tags">
          {tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
        {desc && <div className="device-desc">{desc}</div>}
        <div className="row" style={{marginTop:8}}>
          <Link to={`/devices/${encodeURIComponent(device.id)}`} className="btn">Details</Link>
        </div>
        <div className="device-meta">
          <div><span className="muted">Type</span><br/>{device.type}</div>
          <div><span className="muted">ID</span><br/>{device.id}</div>
        </div>
      </div>
      <div className="device-right">
        <div className="device-section">
          <div className="section-title">Power (W)</div>
          <div className="kpi">
            <div className="item">P50 <strong>{statsP.avg?.toFixed?.(0) ?? '—'}</strong></div>
            <div className="item">P95 <strong>{Number.isFinite(statsP.max)? statsP.max.toFixed(0): '—'}</strong></div>
            <div className="item">P05 <strong>{Number.isFinite(statsP.min)? statsP.min.toFixed(0): '—'}</strong></div>
          </div>
          <div style={{height:120}}>
            {series.P && series.P.length>0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.P}>
                  <CartesianGrid stroke={T.grid} />
                  <XAxis dataKey="ts" tick={{fontSize:10}} tickFormatter={fmt} stroke={T.axis}/>
                  <YAxis stroke={T.axis} tick={{fontSize:10}} domain={[dataMin=> (Number.isFinite(dataMin)? dataMin-1: 0), dataMax=> (Number.isFinite(dataMax)? dataMax+1: 1)]}/>
                  <Tooltip labelFormatter={(v)=>new Date(v).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke={T.series.warning} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <SkeletonBox height={120} />
            )}
          </div>
        </div>
        <div className="device-grid">
          <div className="small-card">
          <div className={`section-title ${levels.U}`}>Voltage (V)</div>
            <div style={{height:80}}>
              {series.U && series.U.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.U}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis} />
                    <YAxis hide stroke={T.axis} domain={["auto","auto"]} />
                    <Line type="monotone" dataKey="value" stroke={T.series.purple} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <SkeletonBox height={80} />
              )}
            </div>
          </div>
          <div className="small-card">
          <div className={`section-title ${levels.temp}`}>Temperature (°C)</div>
            <div style={{height:80}}>
              {series.temp && series.temp.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.temp}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis} />
                    <YAxis hide stroke={T.axis} domain={["auto","auto"]} />
                    <Line type="monotone" dataKey="value" stroke={T.series.danger} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <SkeletonBox height={80} />
              )}
            </div>
          </div>
          <div className="small-card">
          <div className={`section-title ${levels.pf}`}>Power Factor</div>
            <div style={{height:80}}>
              {series.pf && series.pf.length>0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.pf}>
                    <CartesianGrid stroke={T.grid} />
                    <XAxis dataKey="ts" hide stroke={T.axis} />
                    <YAxis hide stroke={T.axis} domain={[0,1]} />
                    <Line type="monotone" dataKey="value" stroke={T.series.secondary} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <SkeletonBox height={80} />
              )}
            </div>
          </div>
        </div>
        <div className="device-section">
          <div className="section-title">Energy by hour (kWh)</div>
          <div style={{height:120}}>
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
              <SkeletonBox height={120} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
