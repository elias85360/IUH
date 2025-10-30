import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { Chart as ChartJSReact } from 'react-chartjs-2'
import { registerBaseCharts, registerMatrix } from '../lib/chartjs-setup.js'

export default function CalendarHeatmap({ devices }) {
  const { anchorNow } = useUiStore()
  const [days, setDays] = useState([]) // [{dateStr, kwh, dow, week}]
  const [ready, setReady] = useState(false)
  useEffect(()=>{ registerBaseCharts(); registerMatrix().then(()=> setReady(true)).catch(()=> setReady(true)) }, [])
  useEffect(()=>{
    let cancel=false
    async function run(){
      const now = new Date(anchorNow)
      const year = now.getFullYear(); const month = now.getMonth()
      const first = new Date(year, month, 1)
      const nextMonth = new Date(year, month+1, 1)
      const bucketMs = 24*60*60*1000
      const map = new Map()
      for (const d of devices||[]) {
        const r = await api.timeseries(d.id,'E',{from:first.getTime(),to:nextMonth.getTime(),bucketMs})
        for (const p of (r.points||[])){
          const date = new Date(p.ts); const key = date.toISOString().slice(0,10)
          map.set(key, (map.get(key)||0) + (Number(p.sum||p.value||0)/1000))
        }
      }
      const firstDow = first.getDay()
      const arr=[]
      const dt=new Date(first)
      let idx=0
      while (dt < nextMonth){
        const key = dt.toISOString().slice(0,10)
        const dow = dt.getDay()
        const week = Math.floor((idx + firstDow) / 7)
        arr.push({ dateStr: key, kwh: map.get(key)||0, dow, week })
        idx++; dt.setDate(dt.getDate()+1)
      }
      if (!cancel) setDays(arr)
    }
    run(); return ()=>{ cancel=true }
  }, [anchorNow, devices])

  const { data, options } = useMemo(()=>{
    const values = days.map(d=>d.kwh)
    const max = Math.max(1, ...values)
    const min = Math.min(0, ...values)
    const scale = (v) => {
      const r = (v - min) / Math.max(1e-9, (max - min))
      const a = 0.1 + 0.8 * r
      return `rgba(91,188,255,${a})`
    }
    const points = days.map(d => ({ x: d.week, y: d.dow, v: d.kwh, backgroundColor: scale(d.kwh), dateStr: d.dateStr }))
    const weeks = days.length ? Math.max(...days.map(d=>d.week)) + 1 : 5
    const lab = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return {
      data: { datasets: [{ label: 'Monthly kWh', data: points, parsing: false, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', width: ({chart}) => (chart.chartArea?.width||0)/weeks - 2, height: ({chart}) => (chart.chartArea?.height||0)/7 - 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: { type: 'linear', min: -0.5, max: weeks-0.5, ticks: { stepSize: 1 } }, y: { type: 'linear', min: -0.5, max: 6.5, ticks: { callback: (v)=> lab[Math.round(v)] } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx)=> `${ctx.raw.dateStr}: ${Number(ctx.raw.v).toFixed(1)} kWh` } } },
      }
    }
  }, [days])

  return (
    <div className="panel">
      <div className="panel-title">Monthly Energy (kWh/day)</div>
      <div style={{height:240}}>
        {ready && <ChartJSReact type='matrix' data={data} options={options} />}
      </div>
    </div>
  )
}

