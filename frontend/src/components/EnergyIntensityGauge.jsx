import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function EnergyIntensityGauge({ devices }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [val, setVal] = useState(0)

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/48))
      let kwh=0
      for (const d of devices){
        const r = await api.timeseries(d.id,'E',{from,to,bucketMs})
        kwh += (r.points||[]).reduce((s,p)=> s + ((p.sum||p.value||0)/1000), 0)
      }
      const intensity = devices.length? kwh / devices.length : 0
      if (!cancel) setVal(intensity)
    }
    run(); return ()=>{ cancel=true } 
  }, [devices, from, to])

  const target = 100
  const pct = Math.max(0, Math.min(1, val/target))
  const data = [{ name:'val', value: pct }, { name:'rest', value: 1-pct }]
  const COLORS = ['#5bbcff','#1e293b']

  return (
    <div className="panel">
      <div className="panel-title">Energy Intensity</div>
      <div style={{display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
        <div style={{width:'var(--gauge-size)', height:'var(--gauge-size)'}}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={50} outerRadius={70} startAngle={180} endAngle={0}>
                {data.map((e,i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]} />))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{fontSize:28, fontWeight:700}}>{Math.round(val)} <span style={{fontSize:14}}>kWh/device</span></div>
      </div>
    </div>
  )
}
