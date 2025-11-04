import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { chartTheme as T } from '../src/lib/theme.js'
import { api } from '../src/services/api.js'
import { useUiStore } from '../src/state/filters.js'
import { yDomainFor, yTickFormatterFor, timeTickFormatter, bucketForSpan } from '../src/lib/format.js'

export default function OverviewSparklines({ devices, metricKey='P', title='Power trend (per device)' }) {
  const { anchorNow, period } = useUiStore()
  const [series, setSeries] = useState([])
  const from = anchorNow - period.ms
  const to = anchorNow
 
  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = bucketForSpan(to-from)
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
                  {/* Hidden axes to control domain/precision without visual clutter */}
                  <XAxis dataKey="ts" hide tickFormatter={timeTickFormatter(from, to)} />
                  <YAxis hide domain={yDomainFor(metricKey, s.points)} tickFormatter={yTickFormatterFor(metricKey)} allowDecimals />
                  <Line type="monotone" dataKey="value" stroke={T.series.purple} dot={false} strokeWidth={1.2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
