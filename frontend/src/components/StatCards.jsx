import { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api.js'
import { toDisplay, unitForMetric } from '../lib/format.js'
import { useUiStore } from '../state/filters.js'
import { useSettings } from '../state/settings.js'

/** Petit composant KPI (tuile blanche compacte) */
const Card = ({ title, value, unit, icon, subtitle, rightExtra }) => (
  <div className="statcard">
    <div className="row" style={{ justifyContent:'space-between', alignItems:'flex-start' }}>
      <div>
        <div className="stat-title">{title}</div>
        <div className="stat-value">
          {value} {unit && <span className="stat-unit">{unit}</span>}
          {rightExtra}
        </div>
        {subtitle && <div className="stat-sub">{subtitle}</div>}
      </div>
      <div className="stat-icon" aria-hidden="true">{icon}</div>
    </div>
  </div>
)

export default function StatCards({ devices }) {
  const [totals, setTotals] = useState({ energy: 0, voltage: 0, current: 0, pf: 0, lastUpdateAge: null, prev: {} })
  const { anchorNow } = useUiStore()
  const { getThreshold } = useSettings()
  const now = anchorNow
  const from = now - 24*60*60*1000

  useEffect(()=>{
    let cancel=false
    async function run() {
      const bucketMs = 60*60*1000
      let cur = { e:0,uSum:0,uN:0,iSum:0,iN:0,pfSum:0,pfN:0, lastTs:0 }
      let prev = { e:0,uSum:0,uN:0,iSum:0,iN:0,pfSum:0,pfN:0 }
      for (const d of devices) {
        const [E,U,I,pf,P, Eprev, Uprev, Iprev, pfprev] = await Promise.all([
          api.timeseries(d.id, 'E',  { from, to: now, bucketMs }),
          api.timeseries(d.id, 'U',  { from, to: now, bucketMs }),
          api.timeseries(d.id, 'I',  { from, to: now, bucketMs }),
          api.timeseries(d.id, 'pf', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'P',  { from, to: now, bucketMs }),
          api.timeseries(d.id, 'E',  { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'U',  { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'I',  { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'pf', { from: from - (now-from), to: from, bucketMs }),
        ])
        // current window
        cur.e += (E.points||[]).reduce((s,b)=> s + (b.sum||b.value||0), 0)
        const uAll = (U.points||[]); if (uAll.length){ cur.uSum += uAll.reduce((s,b)=>s+(b.value||0),0); cur.uN += uAll.length }
        const iAll = (I.points||[]); if (iAll.length){ cur.iSum += iAll.reduce((s,b)=>s+(b.value||0),0); cur.iN += iAll.length }
        const pfAll = (pf.points||[]); if (pfAll.length){ cur.pfSum += pfAll.reduce((s,b)=>s+(b.value||0),0); cur.pfN += pfAll.length }
        const last = (P.points||[]).at(-1)?.ts
        if (Number.isFinite(last) && last > cur.lastTs) cur.lastTs = last
        // previous window
        prev.e += (Eprev.points||[]).reduce((s,b)=> s + (b.sum||b.value||0), 0)
        const uPrev = (Uprev.points||[]); if (uPrev.length){ prev.uSum += uPrev.reduce((s,b)=>s+(b.value||0),0); prev.uN += uPrev.length }
        const iPrev = (Iprev.points||[]); if (iPrev.length){ prev.iSum += iPrev.reduce((s,b)=>s+(b.value||0),0); prev.iN += iPrev.length }
        const pfPrev = (pfprev.points||[]); if (pfPrev.length){ prev.pfSum += pfPrev.reduce((s,b)=>s+(b.value||0),0); prev.pfN += pfPrev.length }
      }
      const age = cur.lastTs ? Math.max(0, now - Number(cur.lastTs)) : null
      const curVals = {
        energy: Math.round(cur.e/1000),
        voltage: cur.uN? Math.round(cur.uSum/cur.uN) : 0,
        current: cur.iN? Math.round(cur.iSum/cur.iN) : 0,
        pf: cur.pfN? Math.round((cur.pfSum/cur.pfN)*100) : 0, // % stocké de 0..100
        lastUpdateAge: age,
      }
      const prevVals = {
        energy: Math.round(prev.e/1000),
        voltage: prev.uN? Math.round(prev.uSum/prev.uN) : 0,
        current: prev.iN? Math.round(prev.iSum/prev.iN) : 0,
        pf: prev.pfN? Math.round((prev.pfSum/prev.pfN)*100) : 0,
      }
      if (!cancel) setTotals({ ...curVals, prev: prevVals })
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, now])

  const unitE = unitForMetric('E')
  const unitU = unitForMetric('U')
  const unitI = unitForMetric('I')
  const unitPf = unitForMetric('pf')

  // Helpers UI
  const deltaChip = (cur, prev) => {
    if (prev == null || prev === 0) return null
    const d = ((cur - prev) / Math.abs(prev)) * 100
    const up = d >= 0
    return (
      <span
        className="chip"
        style={{
          marginLeft: 8,
          borderColor: up ? '#22c55e' : '#ef4444',
          color: up ? '#16a34a' : '#dc2626',
          background: up ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
        }}
        title={`${up ? 'Up' : 'Down'} ${Math.abs(d).toFixed(1)}% vs prev`}
      >
        {up ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
      </span>
    )
  }

  const ageText = useMemo(()=>{
    const ms = totals.lastUpdateAge
    if (ms==null) return '—'
    const s = Math.floor(ms/1000); if (s<60) return `${s}s`
    const m = Math.floor(s/60);   if (m<60) return `${m}m`
    const h = Math.floor(m/60);   return `${h}h`
  }, [totals.lastUpdateAge])

  const ageColor = useMemo(()=>{
    const ms = totals.lastUpdateAge
    if (ms==null) return '#0f172a'
    if (ms > 6*60*60*1000) return '#ef4444'
    if (ms > 60*60*1000)   return '#d97706'
    return '#16a34a'
  }, [totals.lastUpdateAge])

  // Niveau SLA (ok/warn/crit) à partir de thresholds
  function level(metric, value){
    if (value==null) return 'ok'
    const th = getThreshold('GLOBAL_DEFAULTS', metric) || {}
    const dir = th.direction || (metric==='pf' ? 'below' : 'above')
    if (dir==='below') {
      if (th.crit!=null && value<=th.crit) return 'crit'
      if (th.warn!=null && value<=th.warn) return 'warn'
      return 'ok'
    }
    if (th.crit!=null && value>=th.crit) return 'crit'
    if (th.warn!=null && value>=th.warn) return 'warn'
    return 'ok'
  }

  return (
    <div className="statgrid" style={{ marginTop: 6 }}>
      {/* Energy */}
      <Card
        title="Energy"
        value={toDisplay('E', totals.energy).toFixed(1)}
        unit={unitE}
        icon="⚡"
        subtitle="Sum last 24h"
        rightExtra={deltaChip(totals.energy, totals.prev?.energy)}
      />

      {/* Voltage */}
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="stat-title">Voltage</div>
            <div className="stat-value">
              <span className={`sla-band ${level('U', totals.voltage)}`}></span>
              {toDisplay('U', totals.voltage).toFixed(1)} <span className="stat-unit">{unitU}</span>
              {deltaChip(totals.voltage, totals.prev?.voltage)}
            </div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">🔌</div>
        </div>
      </div>

      {/* Current */}
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="stat-title">Current</div>
            <div className="stat-value">
              <span className={`sla-band ${level('I', totals.current)}`}></span>
              {toDisplay('I', totals.current).toFixed(1)} <span className="stat-unit">{unitI}</span>
              {deltaChip(totals.current, totals.prev?.current)}
            </div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">🔋</div>
        </div>
      </div>

      {/* Power Factor */}
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="stat-title">Power Factor</div>
            <div className="stat-value">
              <span className={`sla-band ${level('pf', totals.pf/100)}`}></span>
              {(totals.pf/100).toFixed(2)} <span className="stat-unit">{unitPf}</span>
              {deltaChip(totals.pf, totals.prev?.pf)}
            </div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">📈</div>
        </div>
      </div>

      {/* Last update */}
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="stat-title">Last update</div>
            <div className="stat-value" style={{ color: ageColor }}>
              {ageText}<span className="stat-unit"> ago</span>
            </div>
            <div className="stat-sub">Max across devices (P)</div>
          </div>
          <div className="stat-icon">⏱️</div>
        </div>
      </div>
    </div>
  )
}
