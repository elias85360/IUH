import { useEffect, useRef, useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { unitForMetric } from '../lib/format.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import SkeletonBox from './SkeletonBox.jsx'
import { exportNodeAsPng } from '../lib/exportPng.js'

// Palette claire cohérente avec le thème
const COLORS = ['#2563eb','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function EnergyMixDonut({ devices, by='device', onSlice }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([])
  const chartRef = useRef(null)

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const list=[]
      for (const d of devices) {
        // Helper avec fallback intégration P -> kWh
        const buckets = await fetchEnergyBuckets([d], from, to, bucketMs)
        const kwh = buckets.reduce((s,r)=> s + r.kwh, 0)
        list.push({ id: d.id, name: d.name, value: Math.max(0, kwh) })
      }
      if (!cancel) setRows(list)
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  const unit = unitForMetric('E')
  const total = rows.reduce((s,r)=> s + r.value, 0)

  const tooltipStyle = useMemo(()=>({
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
  }), [])

  return (
    <div style={{ position:'relative', height:'var(--chart-h)', minHeight: 220 }}>
      {/* Export PNG en haut-droite */}
      <button
        className="chip"
        onClick={()=> exportNodeAsPng(chartRef.current, 'energy-mix.png')}
        style={{ position:'absolute', right:12, top:8, zIndex:1 }}
        title="Exporter en PNG"
      >
        Export PNG
      </button>

      <div ref={chartRef} style={{ height:'100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              label={(e)=>{
                const pct = total ? (e.value/total)*100 : 0
                // Afficher l'étiquette seulement si ≥ 8 % pour éviter le bruit
                return pct >= 8 ? `${e.name} ${pct.toFixed(1)}%` : ''
              }}
              labelLine={false}
              onClick={(d)=>{ try { onSlice && onSlice(d?.payload?.id, 'P') } catch {} }}
            >
              {rows.map((e,i)=>(
                <Cell key={i} fill={COLORS[i % COLORS.length]} cursor={onSlice ? 'pointer' : 'default'} />
              ))}
            </Pie>

            <Tooltip
              formatter={(v)=> [Number(v).toFixed(1), unit]}
              contentStyle={tooltipStyle}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              layout="horizontal"
              iconType="circle"
              wrapperStyle={{ paddingTop: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {(!rows || !rows.length) && <SkeletonBox height={'100%'} />}
    </div>
  )
}
