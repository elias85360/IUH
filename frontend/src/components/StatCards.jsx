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

export default function StatCards({ devices }) {
  const [totals, setTotals] = useState({ energy: 0, voltage: 0, current: 0, pf: 0 })
  const { anchorNow } = useUiStore()
  const now = anchorNow
  const from = now - 24*60*60*1000

  useEffect(()=>{
    let cancel=false
    async function run() {
      const bucketMs = 60*60*1000
      // Sum across devices
      let eSum=0, uSum=0, uCount=0, iSum=0, iCount=0, pfSum=0, pfCount=0
      for (const d of devices) {
        const [E,U,I,pf] = await Promise.all([
          api.timeseries(d.id, 'E', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'U', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'I', { from, to: now, bucketMs }),
          api.timeseries(d.id, 'pf', { from, to: now, bucketMs }),
        ])
        eSum += (E.points||[]).reduce((s,b)=> s + (b.sum||b.value||0), 0)
        const uAll = (U.points||[]); if (uAll.length){ uSum += uAll.reduce((s,b)=>s+(b.value||0),0); uCount += uAll.length }
        const iAll = (I.points||[]); if (iAll.length){ iSum += iAll.reduce((s,b)=>s+(b.value||0),0); iCount += iAll.length }
        const pfAll = (pf.points||[]); if (pfAll.length){ pfSum += pfAll.reduce((s,b)=>s+(b.value||0),0); pfCount += pfAll.length }
      }
      if (!cancel) setTotals({
        energy: Math.round(eSum/1000), // kWh (assuming E in Wh)
        voltage: uCount? Math.round(uSum/uCount) : 0,
        current: iCount? Math.round(iSum/iCount) : 0,
        pf: pfCount? Math.round((pfSum/pfCount)*100) : 0,
      })
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices])

  return (
    <div className="statgrid">
      <Card title="Energy" value={totals.energy} unit="kWh" subtitle="This month" icon={<span>⚡</span>} />
      <Card title="Voltage" value={totals.voltage} unit="V" subtitle="Avg last 24h" icon={<span>🔌</span>} />
      <Card title="Current" value={totals.current} unit="A" subtitle="Avg last 24h" icon={<span>🔋</span>} />
      <Card title="Power Factor" value={totals.pf} unit="%" subtitle="Avg last 24h" icon={<span>📈</span>} />
    </div>
  )
}
