import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import { chartTheme as T } from '../lib/theme.js'

const COLORS = ['#5bbcff','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function RoomContribution({ devices=[], onSelectRoom }) {
  const { anchorNow, period } = useUiStore()
  const { meta } = useAssets()
  const [rows, setRows] = useState([])
  const [relative, setRelative] = useState(false)

  const groups = useMemo(()=>{
    const map = new Map()
    for (const d of devices){
      const m = meta[d.id] || {}
      const room = (m.room || d.room || '—')
      if (!map.has(room)) map.set(room, [])
      map.get(room).push(d) 
    }
    return Array.from(map.entries()) // [room, device[]]
  }, [devices, meta])

  useEffect(()=>{
    let cancel=false
    async function run(){
      const from = anchorNow - period.ms
      const to = anchorNow
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/24))
      const out=[]
      for (const [room, devs] of groups){
        let kwh=0
        for (const d of devs){
          const b = await fetchEnergyBuckets([d], from, to, bucketMs)
          kwh += b.reduce((s,r)=>s+r.kwh,0)
        }
        out.push({ room, kwh })
      }
      out.sort((a,b)=>b.kwh-a.kwh)
      if (!cancel) setRows(out)
    }
    run(); return ()=>{ cancel=true }
  }, [groups, anchorNow, period])

  const total = rows.reduce((s,r)=>s+r.kwh,0)
  const view = relative && total>0 ? rows.map(r => ({ ...r, kwh: (r.kwh/total)*100 })) : rows
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">Contribution by Room ({relative? '%':'kWh'})</div><button className="btn" onClick={()=>setRelative(v=>!v)}>{relative? 'Absolu':'% Relatif'}</button></div>
      <div style={{height:240}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={view} layout="vertical" margin={{left: 100}} onClick={(e)=>{ const r=e?.activePayload?.[0]?.payload?.room; if (r && onSelectRoom) onSelectRoom(r) }}>
            <CartesianGrid stroke={T.grid} />
            <XAxis type="number" stroke={T.axis} tickFormatter={(v)=> relative? `${v.toFixed(1)}%` : v.toFixed(1)} />
            <YAxis type="category" dataKey="room" stroke={T.axis} width={120} />
            <Tooltip formatter={(v)=> relative? [v.toFixed(1),'%'] : [Number(v).toFixed(1),'kWh']} />
            <Bar dataKey="kwh" fill={COLORS[0]} cursor={onSelectRoom? 'pointer':'default'} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

