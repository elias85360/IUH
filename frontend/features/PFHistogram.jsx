import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../src/services/api.js'
import { useUiStore } from '../src/state/filters.js'

export default function PFHistogram({ devices, bins=10 }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([])

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*1000, Math.floor((to-from)/200))
      const values=[]
      for (const d of devices) {
        const r = await api.timeseries(d.id, 'pf', { from, to, bucketMs })
        for (const p of (r.points||[])) { const v = Number(p.value); if (Number.isFinite(v)) values.push(v) }
      }
      const lo=0.5, hi=1.0 
      const step=(hi-lo)/bins
      const hist=Array.from({length:bins}, (_,i)=>({ bin:`${(lo+i*step).toFixed(2)}-${(lo+(i+1)*step).toFixed(2)}`, count:0 }))
      for (const v of values){ const idx=Math.min(bins-1, Math.max(0, Math.floor((v-lo)/step))); hist[idx].count++ }
      if (!cancel) setRows(hist)
    }
    if (devices.length) run()
    return ()=>{ cancel=true }
  }, [devices, from, to, bins])

  return (
    <div className="panel">
      <div className="panel-title">Power Factor distribution</div>
      <div style={{height:220}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="#eef2f7" />
            <XAxis dataKey="bin" stroke="#6b7280" tick={{ fontSize: 10 }}/>
            <YAxis stroke="#6b7280"/>
            <Tooltip />
            <Bar dataKey="count" fill="#a855f7" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

