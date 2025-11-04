import { useEffect, useMemo, useState } from 'react'
import { api } from '../src/services/api.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function UsageByDevice({ devices, from, to }) {
  const [rows, setRows] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = 60*60*1000 
      const list = []
      for (const d of devices) {
        const res = await api.timeseries(d.id, 'E', { from, to, bucketMs })
        const kwh = (res.points||[]).reduce((s,b)=> s + ((b.sum||b.value||0)/1000), 0)
        list.push({ name: d.name, value: Math.round(kwh) })
      }
      list.sort((a,b)=>b.value-a.value)
      if (!cancel) setRows(list)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to])
  return (
    <div className="panel">
      <div className="panel-title">Electricity usage by device</div>
      <div style={{height:260}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{left: 80}}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis type="number" stroke="#6b7280"/>
            <YAxis type="category" dataKey="name" stroke="#6b7280"/>
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
