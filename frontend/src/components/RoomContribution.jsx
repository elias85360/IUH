import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import { chartTheme as T } from '../lib/theme.js'

const COLORS = ['#5bbcff','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function RoomContribution({ devices=[] }) {
  const { anchorNow, period } = useUiStore()
  const { meta } = useAssets()
  const [rows, setRows] = useState([])

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

  return (
    <div className="panel">
      <div className="panel-title">Contribution by Room (kWh)</div>
      <div style={{height:240}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{left: 100}}>
            <CartesianGrid stroke={T.grid} />
            <XAxis type="number" stroke={T.axis} />
            <YAxis type="category" dataKey="room" stroke={T.axis} width={120} />
            <Tooltip />
            <Bar dataKey="kwh" fill={COLORS[0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

