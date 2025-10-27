import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function OverviewSparklines({ devices, metricKey='P', title='Power trend (per device)' }) {
  const { anchorNow, period } = useUiStore()
  const [series, setSeries] = useState([])
  const from = anchorNow - period.ms
  const to = anchorNow
 
  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*1000, Math.floor((to-from)/120))
      const list = []
      for (const d of devices) {
        const res = await api.timeseries(d.id, metricKey, { from, to, bucketMs })
        list.push({ device: d, points: (res.points||[]).map(p=>({ ts:p.ts, value:Number(p.value) })) })
      }
      if (!cancel) setSeries(list)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, metricKey, from, to])

  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
        {series.map((s, idx)=> (
          <div key={s.device.id} className="statcard">
            <div className="stat-title">{s.device.name}</div>
            <div style={{height:60}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} syncId="home">
                  <Line type="monotone" dataKey="value" stroke={T.series.purple} dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
