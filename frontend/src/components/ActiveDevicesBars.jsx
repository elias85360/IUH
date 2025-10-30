import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts'
import { api } from '../services/api.js'
import { chartTheme as T } from '../lib/theme.js'
import { useUiStore } from '../state/filters.js'
import { yTickFormatterFor, unitForMetric, toDisplay } from '../lib/format.js'

export default function ActiveDevicesBars({ devices, top=6, onSelectDevice }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([])
  useEffect(()=>{
    let cancel=false
    async function run(){ 
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const list=[]
      for (const d of devices) {
        const r = await api.timeseries(d.id,'P',{from,to,bucketMs})
        const avg = (r.points||[]).reduce((s,pt)=> s + Number(pt.value||0),0) / Math.max(1,(r.points||[]).length)
        list.push({ id: d.id, name: d.name, value: avg })
      }
      list.sort((a,b)=>b.value-a.value)
      if (!cancel) setRows(list.slice(0, top))
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to, top])
  return (
    <div className="panel">
      <div className="panel-title">Active Devices (avg {unitForMetric('P')})</div>
      <div style={{flex:1, minHeight:0}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 80 }} onClick={(e)=>{ if (onSelectDevice && e && e.activePayload && e.activePayload[0]) { const d = e.activePayload[0].payload; onSelectDevice(d.id, 'P') } }}>
            <CartesianGrid stroke={T.grid} />
            <XAxis type="number" stroke={T.axis} tickFormatter={(v)=> toDisplay('P', v).toFixed(1)} />
            <YAxis type="category" dataKey="name" stroke={T.axis} width={120}/>
            <Tooltip formatter={(v)=> [toDisplay('P', v).toFixed(1), unitForMetric('P')]} />
            <Bar dataKey={(r)=> toDisplay('P', r.value)} fill={T.series.purple}>
              <LabelList dataKey={(r)=> toDisplay('P', r.value).toFixed(1)} position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {(!rows || rows.length===0) && <SkeletonBox height={220} />}
      </div>
    </div>
  )
}
import SkeletonBox from './SkeletonBox.jsx'
