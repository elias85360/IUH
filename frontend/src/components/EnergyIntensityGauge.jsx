import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function EnergyIntensityGauge({ devices }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow

  const [val, setVal] = useState(0)                      // kWh / device (fenêtre période)
  const [stats, setStats] = useState({ min: 0, max: 0, avg: 0 })

  useEffect(()=>{
    let cancel = false
    async function run(){
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
    <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
      {/* Jauge semi-circulaire */}
      <div style={{ position:'relative', width:'var(--gauge-size)', height:'var(--gauge-size)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={50}
              outerRadius={70}
              startAngle={180}
              endAngle={0}
              isAnimationActive={false}
            >
              <Cell key="val"  fill={FILL}  />
              <Cell key="rest" fill={TRACK} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* % au centre de la jauge */}
        <div
          style={{
            position:'absolute', left:'50%', top:'58%',
            transform:'translate(-50%, -50%)',
            fontWeight:700, fontSize:14, color:'#0f172a'
          }}
          aria-hidden="true"
        >
          {Math.round(pct * 100)}%
        </div>
      </div>

      {/* Valeur principale */}
      <div style={{ fontSize:28, fontWeight:700 }}>
        {val.toFixed(1)} <span style={{ fontSize:14 }}>kWh/device</span>
      </div>

      {/* Mini stats */}
      <div className="kpi">
        <div className="item">min <strong>{stats.min.toFixed(1)}</strong> kWh</div>
        <div className="item">avg <strong>{stats.avg.toFixed(1)}</strong> kWh</div>
        <div className="item">max <strong>{stats.max.toFixed(1)}</strong> kWh</div>
      </div>
    </div>
  )
}
