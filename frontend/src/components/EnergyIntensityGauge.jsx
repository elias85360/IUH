import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function EnergyIntensityGauge({ devices }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow

  const [val, setVal] = useState(0)
  const [stats, setStats] = useState({ min: 0, max: 0, avg: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let cancel = false
    async function run(){
      setLoading(true)
      const bucketMs = Math.max(60*60*1000, Math.floor((to - from) / 48))
      let kwh = 0
      const vals = []

      for (const d of devices) {
        const r = await api.timeseries(d.id, 'E', { from, to, bucketMs })
        const sum = (r.points || []).reduce((s, p) => s + ((p.sum || p.value || 0) / 1000), 0)
        kwh += sum
        vals.push(sum)
      }

      const intensity = devices.length ? kwh / devices.length : 0
      const min = vals.length ? Math.min(...vals) : 0
      const max = vals.length ? Math.max(...vals) : 0
      const avg = intensity

      if (!cancel) {
        setVal(intensity)
        setStats({ min, max, avg })
        setLoading(false)
      }
    }
    run()
    return () => { cancel = true }
  }, [devices, from, to])

  // Cible de référence (peut être rendue configurable via settings)
  const target = 100
  const pct = Math.max(0, Math.min(1, target ? val / target : 0))
  const data = useMemo(() => ([
    { name: 'val',  value: pct },
    { name: 'rest', value: 1 - pct }
  ]), [pct])

  // Couleurs claires (cohérent avec styles.css)
  const FILL = '#2563eb'  // bleu accent
  const TRACK = '#e5e7eb' // gris clair

  return (
    <div className="gauge-ring">
      <div className="gauge-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={60}
              outerRadius={95}
              startAngle={180}
              endAngle={0}
              isAnimationActive={false}
            >
              <Cell key="val"  fill={FILL}  />
              <Cell key="rest" fill={TRACK} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="gauge-value">
          <div className="v">{loading ? '--%' : `${Math.round(pct * 100)}%`}</div>
          <div className="s">Intensité</div>
        </div>
      </div>
      <div className="gauge-stats">
        <div className="main">
          {loading ? '--' : val.toFixed(1)} <span>kWh/device</span>
        </div>
        <div className="mini">
          <div>min <strong>{loading ? '--' : stats.min.toFixed(1)}</strong> kWh</div>
          <div>avg <strong>{loading ? '--' : stats.avg.toFixed(1)}</strong> kWh</div>
          <div>max <strong>{loading ? '--' : stats.max.toFixed(1)}</strong> kWh</div>
        </div>
      </div>
    </div>
  )
}
