import { useEffect, useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { api } from '../services/api.js'
import { sumEnergyKwh } from '../lib/energy.js'
import { useUiStore } from '../state/filters.js'
import { unitForMetric } from '../lib/format.js'
import SkeletonBox from './SkeletonBox.jsx'

/**
 * Version "bare" pour s'intégrer dans une Card V2 (fond blanc).
 * - Pas de .panel/.panel-header
 * - Tooltip clair, axes/grid clairs
 * - Badge % de variation en haut-droite
 */
export default function ChangeUsageBars({ devices }) {
  const { anchorNow, period } = useUiStore()
  const to = anchorNow
  const from = anchorNow - period.ms
  const prevFrom = from - period.ms
  const prevTo = from

  const [rows, setRows] = useState([])

  useEffect(()=>{
    let cancel = false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const cur = await sumEnergyKwh(devices, from, to, bucketMs)
      const prev = await sumEnergyKwh(devices, prevFrom, prevTo, bucketMs)
      if (!cancel) setRows([
        { name: 'Prev', value: Math.round(prev) },
        { name: 'Now',  value: Math.round(cur)  },
      ])
    }
    run()
    return () => { cancel = true }
  }, [devices, from, to, prevFrom, prevTo])

  const unit = unitForMetric('E')
  const changePct = rows.length===2 ? (((rows[1].value-rows[0].value)/Math.max(1, rows[0].value))*100) : null
  const change = changePct!=null ? changePct.toFixed(2) : null

  const GRID = '#e5e7eb'
  const AXIS = '#64748b'

  const divergeColor = (name) => {
    if (rows.length!==2) return '#60a5fa'       // fallback bleu clair
    if (name==='Prev') return '#94a3b8'         // gris bleuté
    const inc = (rows[1].value - rows[0].value) >= 0
    return inc ? '#ef4444' : '#22c55e'          // rouge si hausse, vert si baisse
  }

  const contentStyle = useMemo(()=>({
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
  }), [])

  return (
    <div style={{ position:'relative', height:'var(--chart-h)', minHeight: 220 }}>
      {/* Badge variation en haut-droite */}
      {change!=null && (
        <div
          className="badge"
          style={{
            position:'absolute', right:12, top:8,
            borderColor: (changePct>=0?'#ef4444':'#22c55e'),
            color: (changePct>=0?'#ef4444':'#22c55e'),
            zIndex: 1
          }}
        >
          {change}% 
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 28, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="name" stroke={AXIS} tickLine={false} />
          <YAxis stroke={AXIS} tickFormatter={(v)=> v.toFixed(1)} tickLine={false} />
          <Tooltip
            formatter={(v)=> [Number(v).toFixed(1), unit]}
            contentStyle={contentStyle}
            cursor={{ fill: 'rgba(2,6,23,0.04)' }}
          />
          <Bar dataKey="value" radius={[8,8,0,0]} fillOpacity={0.95}>
            {rows.map((e, i)=>(
              <Cell key={`c-${i}`} fill={divergeColor(e.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {(!rows || rows.length===0) && <SkeletonBox height={'100%'} />}
    </div>
  )
}
