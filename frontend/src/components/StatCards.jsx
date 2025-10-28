import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const Card = ({ title, value, unit, icon, subtitle }) => (
  <div className="statcard">
    <div className="row" style={{justifyContent:'space-between'}}>
      <div>
        <div className="stat-title">{title}</div>
        <div className="stat-value">{value} <span className="stat-unit">{unit}</span></div>
        <div className="stat-sub">{subtitle}</div>
      </div>
      <div className="stat-icon">{icon}</div> 
    </div>
  </div>
)

import { useUiStore } from '../state/filters.js'
import { useSettings } from '../state/settings.js'

export default function StatCards({ devices }) {
  const [totals, setTotals] = useState({ energy: 0, voltage: 0, current: 0, pf: 0, lastUpdateAge: null })
  const { anchorNow } = useUiStore()
  const { getThreshold } = useSettings()
  const now = anchorNow
  const from = now - 24*60*60*1000

  useEffect(()=>{
    let cancel=false
    async function run() {
      const bucketMs = 60*60*1000
      // Sum across devices for current and previous windows
      let cur = { e:0,uSum:0,uN:0,iSum:0,iN:0,pfSum:0,pfN:0, lastTs:0 }
      let prev = { e:0,uSum:0,uN:0,iSum:0,iN:0,pfSum:0,pfN:0 }
      for (const d of devices) {
        const [E,U,I,pf,P, Eprev, Uprev, Iprev, pfprev] = await Promise.all([
          api.timeseries(d.id, 'E', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'U', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'I', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'pf', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'P', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'E', { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'U', { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'I', { from: from - (now-from), to: from, bucketMs }),
          api.timeseries(d.id, 'pf', { from: from - (now-from), to: from, bucketMs }),
        ])
        cur.e += (E.points||[]).reduce((s,b)=> s + (b.sum||b.value||0), 0)
        const uAll = (U.points||[]); if (uAll.length){ cur.uSum += uAll.reduce((s,b)=>s+(b.value||0),0); cur.uN += uAll.length }
        const iAll = (I.points||[]); if (iAll.length){ cur.iSum += iAll.reduce((s,b)=>s+(b.value||0),0); cur.iN += iAll.length }
        const pfAll = (pf.points||[]); if (pfAll.length){ cur.pfSum += pfAll.reduce((s,b)=>s+(b.value||0),0); cur.pfN += pfAll.length }
        const last = (P.points||[]).at(-1)?.ts
        if (Number.isFinite(last) && last > cur.lastTs) cur.lastTs = last
        // prev
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
        pf: cur.pfN? Math.round((cur.pfSum/cur.pfN)*100) : 0,
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
  }, [devices])

  function fmtAge(ms){
    if (ms==null) return '—'
    const s = Math.floor(ms/1000); if (s<60) return `${s}s`
    const m = Math.floor(s/60); if (m<60) return `${m}m`
    const h = Math.floor(m/60); return `${h}h`
  }

  function arrow(cur, prev){ if (prev==null || prev===0) return ''; const d=((cur-prev)/Math.abs(prev))*100; const sym=d>=0?'▲':'▼'; const col=d>=0?'#22c55e':'#ef4444'; return <span style={{color:col, marginLeft:6}}>{sym} {Math.abs(d).toFixed(1)}%</span> }
  function ageClass(ms){ if (ms==null) return ''; if (ms>6*60*60*1000) return 'crit'; if (ms>60*60*1000) return 'warn'; return 'ok' }
  function level(metric, value){
    if (value==null) return 'ok'
    // Use global defaults via getThreshold with a dummy device id
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
    <div className="statgrid">
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="stat-title">Energy</div>
            <div className="stat-value">{totals.energy}{arrow(totals.energy, totals.prev?.energy)} <span className="stat-unit">kWh</span></div>
            <div className="stat-sub">Sum last 24h</div>
          </div>
          <div className="stat-icon">⚡</div>
        </div>
      </div>
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="stat-title">Voltage</div>
            <div className="stat-value"><span className={`sla-band ${level('U', totals.voltage)}`}></span>{totals.voltage}{arrow(totals.voltage, totals.prev?.voltage)} <span className="stat-unit">V</span></div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">🔌</div>
        </div>
      </div>
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="stat-title">Current</div>
            <div className="stat-value"><span className={`sla-band ${level('I', totals.current)}`}></span>{totals.current}{arrow(totals.current, totals.prev?.current)} <span className="stat-unit">A</span></div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">🔋</div>
        </div>
      </div>
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="stat-title">Power Factor</div>
            <div className="stat-value"><span className={`sla-band ${level('pf', totals.pf/100)}`}></span>{totals.pf}{arrow(totals.pf, totals.prev?.pf)} <span className="stat-unit">%</span></div>
            <div className="stat-sub">Avg last 24h</div>
          </div>
          <div className="stat-icon">📈</div>
        </div>
      </div>
      <div className="statcard">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div>
            <div className="stat-title">Last update</div>
            <div className={`stat-value ${ageClass(totals.lastUpdateAge)}`}>{fmtAge(totals.lastUpdateAge)}<span className="stat-unit"> ago</span></div>
            <div className="stat-sub">Max across devices (P)</div>
          </div>
          <div className="stat-icon">⏱️</div>
        </div>
      </div>
    </div>
  )
}
