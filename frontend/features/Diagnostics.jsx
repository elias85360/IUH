import { useEffect, useState } from 'react'
import { api } from '../src/services/api.js'

export default function Diagnostics() {
  const [d, setD] = useState(null)
  useEffect(()=>{
    let cancel=false
    async function run(){
      const res = await api.diagnostics()
      if(!cancel) setD(res)
    }
    run();
    const t = setInterval(run, 5000)
    return ()=>{ cancel=true; clearInterval(t) }
  },[])
  if (!d) return null
  return (
    <div className="card">
      <h3>Diagnostics</h3> 
      <div className="kpi">
        <div className="item">Devices: <strong>{d.devices}</strong></div>
        <div className="item">Metrics: <strong>{d.metrics}</strong></div>
        <div className="item">Series: <strong>{d.seriesKeys}</strong></div>
        <div className="item">Points: <strong>{d.totalPoints}</strong></div>
        <div className="item">Uptime: <strong>{Math.round(d.uptimeMs/1000)}s</strong></div>
      </div>
    </div>
  )
}

