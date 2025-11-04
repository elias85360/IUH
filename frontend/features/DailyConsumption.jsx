import { useEffect, useState } from 'react'
import { api } from '../src/services/api.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { chartTheme as T } from '../src/lib/theme.js'
import { format } from 'date-fns'

export default function DailyConsumption({ deviceId, periodMs = 7*24*60*60*1000 }) {
  const [data, setData] = useState([])
  useEffect(()=>{
    const now = Date.now()
    const from = now - periodMs
    async function run() {
      const bucketMs = 24*60*60*1000
      const res = await api.timeseries(deviceId, 'power', { from, to: now, bucketMs })
      const daily = (res.points||[]).map(p=>({
        day: format(new Date(p.ts), 'MM-dd'),
        // approximate Wh from avg power * time (h)
        consumption: (Number(p.value) || 0) * (bucketMs/3600000)
      }))
      setData(daily)
    } 
    run()
  }, [deviceId, periodMs])

  return (
    <div className="card">
      <h3>Daily Consumption (7 jours)</h3>
      <div style={{height:220}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="day" stroke={T.axis}/>
            <YAxis stroke={T.axis}/>
            <Tooltip />
            <Bar dataKey="consumption" fill={T.series.blue} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
