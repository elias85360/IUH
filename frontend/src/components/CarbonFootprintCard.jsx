import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'

export default function CarbonFootprintCard({ devices, factorKgPerKWh=0.233 }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [emission, setEmission] = useState(0)

  useEffect(()=>{
    let cancel=false
    async function run(){
      const bucketMs = Math.max(60*60*1000, Math.floor((to-from)/48))
      let kwh=0
      for (const d of devices){
        const r = await api.timeseries(d.id,'E',{from,to,bucketMs})
        kwh += (r.points||[]).reduce((s,p)=> s + ((p.sum||p.value||0)/1000), 0)
      }
      if (!cancel) setEmission(kwh * factorKgPerKWh)
    }
    run(); return ()=>{ cancel=true } 
  }, [devices, from, to, factorKgPerKWh])

  return (
    <div className="panel">
      <div className="panel-title">Carbon Footprint</div>
      <div className="kpi">
        <div className="item">Emission this period: <strong>{emission.toFixed(1)}</strong> kg CO₂</div>
        <div className="item">Factor: <strong>{factorKgPerKWh}</strong> kg/kWh</div>
      </div>
    </div>
  )
}

