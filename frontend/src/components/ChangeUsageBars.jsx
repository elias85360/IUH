import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { api } from '../services/api.js'
import { sumEnergyKwh } from '../lib/energy.js'
import { useUiStore } from '../state/filters.js'

export default function ChangeUsageBars({ devices }) {
  const { anchorNow, period } = useUiStore()
  const to = anchorNow
  const from = anchorNow - period.ms
  const prevFrom = from - period.ms
  const prevTo = from
  const [rows, setRows] = useState([])

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const cur = await sumEnergyKwh(devices, from, to, bucketMs)
      const prev = await sumEnergyKwh(devices, prevFrom, prevTo, bucketMs)
      if (!cancel) setRows([ 
        { name: 'Prev', value: Math.round(prev) },
        { name: 'Now', value: Math.round(cur) },
      ])
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  const change = rows.length===2 ? (((rows[1].value-rows[0].value)/Math.max(1, rows[0].value))*100).toFixed(2) : null

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">Change in Usage</div>{change!=null && <div className="badge">{change}%</div>}</div>
      <div style={{flex:1, minHeight:0}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} syncId="home">
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="name" stroke={T.axis}/>
            <YAxis stroke={T.axis}/>
            <Tooltip />
            <Bar dataKey="value" fill={T.series.primary} />
          </BarChart>
        </ResponsiveContainer>
        {(!rows || rows.length===0) && <SkeletonBox height={'100%'} />}
      </div>
    </div>
  )
}
import SkeletonBox from './SkeletonBox.jsx'
