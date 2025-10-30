import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { chartTheme as T } from '../lib/theme.js'
import { api } from '../services/api.js'
import { sumEnergyKwh } from '../lib/energy.js'
import { useUiStore } from '../state/filters.js'
import { unitForMetric } from '../lib/format.js'

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

  const changePct = rows.length===2 ? (((rows[1].value-rows[0].value)/Math.max(1, rows[0].value))*100) : null
  const change = changePct!=null ? changePct.toFixed(2) : null
  const divergeColor = (name) => {
    if (rows.length!==2) return T.series.primary
    if (name==='Prev') return '#64748b'
    const inc = (rows[1].value - rows[0].value) >= 0
    return inc ? '#ef4444' : '#22c55e'
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">Change in Usage ({unitForMetric('E')})</div>{change!=null && <div className="badge" style={{borderColor: (changePct>=0?'#ef4444':'#22c55e'), color:(changePct>=0?'#ef4444':'#22c55e')}}>{change}%</div>}</div>
      <div style={{flex:1, minHeight:0}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} syncId="home">
            <CartesianGrid stroke={T.grid} />
            <XAxis dataKey="name" stroke={T.axis}/>
            <YAxis stroke={T.axis} tickFormatter={(v)=> v.toFixed(1)} />
            <Tooltip formatter={(v, name)=> [Number(v).toFixed(1), unitForMetric('E')]} />
            <Bar dataKey="value" fillOpacity={0.9}>
              {rows.map((e, i)=>(
                <Cell key={`c-${i}`} fill={divergeColor(e.name)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {(!rows || rows.length===0) && <SkeletonBox height={'100%'} />}
      </div>
    </div>
  )
}
import SkeletonBox from './SkeletonBox.jsx'
