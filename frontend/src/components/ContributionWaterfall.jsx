import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useUiStore } from '../state/filters.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import { chartTheme as T } from '../lib/theme.js'

const COLORS = ['#5bbcff','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function ContributionWaterfall({ devices=[], top=6, title='Contribution by Device (kWh)' }) {
  const { anchorNow, period } = useUiStore()
  const [data, setData] = useState([])

  useEffect(()=>{
    let cancel=false
    async function run(){
      const from = anchorNow - period.ms
      const to = anchorNow
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const totals=[]
      for (const d of devices) {
        const rows = await fetchEnergyBuckets([d], from, to, bucketMs)
        const kwh = rows.reduce((s,r)=>s+r.kwh,0)
        totals.push({ name: d.name, value: kwh })
      } 
      totals.sort((a,b)=>b.value-a.value)
      const topN = totals.slice(0, top)
      const others = totals.slice(top).reduce((s,x)=>s+x.value,0)
      const datum = {}
      topN.forEach((t,i)=>{ datum[t.name] = t.value })
      if (others>0) datum['Others'] = others
      if (!cancel) setData([datum])
    }
    run(); return ()=>{ cancel=true }
  }, [devices, anchorNow, period])

  const keys = data.length? Object.keys(data[0]) : []

  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{height:240}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey={()=>'Devices'} stroke={T.axis} />
            <YAxis stroke={T.axis} />
            <Tooltip />
            <Legend />
            {keys.map((k,idx)=> (
              <Bar key={k} dataKey={k} stackId="1" fill={COLORS[idx%COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

