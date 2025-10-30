import { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { unitForMetric } from '../lib/format.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import SkeletonBox from './SkeletonBox.jsx'
import { exportNodeAsPng } from '../lib/exportPng.js'

const COLORS = ['#5bbcff','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4']

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
        // use helper with fallback P integration
        const rows = await fetchEnergyBuckets([d], from, to, bucketMs)
        const kwh = rows.reduce((s,r)=>s+r.kwh,0)
        list.push({ id: d.id, name: d.name, value: Math.max(0, kwh) })
      }
      if (!cancel) setRows(list) 
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  return (
    <div className="panel">
      <div className="panel-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="panel-title">Energy Mix ({unitForMetric('E')})</div>
        <button className="btn" onClick={()=> exportNodeAsPng(chartRef.current, 'energy-mix.png')}>Export PNG</button>
      </div>
      <div style={{flex:1, minHeight:0}} ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2} label={(e)=>{
              const total = rows.reduce((s,r)=>s+r.value,0)
              const pct = total? (e.value/total)*100 : 0
              return pct>=8 ? `${e.name} ${pct.toFixed(1)}%` : ''
            }} labelLine={false} onClick={(d)=>{ try { onSlice && onSlice(d?.payload?.id, 'P') } catch {} }}>
              {rows.map((e,i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]} cursor={onSlice? 'pointer' : 'default'} />))}
            </Pie>
            <Tooltip formatter={(v)=> [v.toFixed(1), unitForMetric('E')]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {(!rows || !rows.length) && <SkeletonBox height={'100%'} />}
    </div>
  )
}
