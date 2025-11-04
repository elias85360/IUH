import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../src/services/api.js'
import { useUiStore } from '../src/state/filters.js'
import { robustZ } from '../src/lib/statsRobust.js'
import { Chart as ChartJSReact } from 'react-chartjs-2'
import { registerBaseCharts } from '../src/lib/chartjs-setup.js'
try { registerBaseCharts() } catch {}

export default function HomeAnomalies({ devices = [], topN = 8 }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow
  const [rows, setRows] = useState([])
  const chartRef = useRef(null)
  // base charts already registered synchronously
  useEffect(()=>{
    let cancel=false
    async function run(){
      const out = []
      const span = to - from
      const target = span <= 24*60*60*1000 ? 240 : span <= 7*24*60*60*1000 ? 480 : span <= 31*24*60*60*1000 ? 720 : 1200
      const bucketMs = Math.max(60*1000, Math.floor(span/target))
      for (const d of devices) {
        try {
          const r = await api.timeseries(d.id, 'P', { from, to, bucketMs })
          const pts = (r.points||[]).map(p => ({ ts: Number(p.ts), value: Number(p.value) })).filter(p => Number.isFinite(p.ts) && Number.isFinite(p.value))
          if (!pts.length) continue
          const zs = robustZ(pts.map(p=>p.value))
          for (let i=0;i<pts.length;i++) {
            const z = zs[i]?.z
            if (!Number.isFinite(z)) continue
            out.push({ deviceId: d.id, deviceName: d.name, ts: pts[i].ts, value: pts[i].value, z })
          }
        } catch {}
      }
      if (!cancel) setRows(out)
    }
    run(); return ()=>{ cancel=true }
  }, [devices, from, to])

  const top = useMemo(()=> rows.slice().sort((a,b)=> Math.abs(b.z) - Math.abs(a.z)).slice(0, topN), [rows, topN])

  const scatter = useMemo(()=>{
    const data = {
      datasets: [{
        label: 'Anomalies (z-score)',
        data: rows.map(r => ({ x: r.ts, y: r.z })),
        borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.35)', pointRadius: 2,
        showLine: false,
      },{
        label: '+Z', data: [{ x: from, y: 3 }, { x: to, y: 3 }], borderColor: '#f59e0b', borderDash: [4,2], pointRadius: 0, showLine: true,
      },{
        label: '-Z', data: [{ x: from, y: -3 }, { x: to, y: -3 }], borderColor: '#f59e0b', borderDash: [4,2], pointRadius: 0, showLine: true,
      }]
    }
    const options = {
      responsive: true, maintainAspectRatio: false, animation: false,
      parsing: false,
      scales: { x: { type: 'time' }, y: { suggestedMin: -6, suggestedMax: 6 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx)=> `z=${Number(ctx.parsed.y).toFixed(2)}` } } },
    }
    return { data, options }
  }, [rows, from, to])

  return (
    <div className="panel">
      <div className="panel-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="panel-title">Anomalies (z-score)</div>
        <button className="btn" onClick={()=>{
          try {
            const inst = chartRef.current
            const url = inst && inst.toBase64Image ? inst.toBase64Image('image/png', 1) : null
            if (url) {
              const a = document.createElement('a'); a.href = url; a.download = 'anomalies.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a)
            }
          } catch {}
        }}>Export PNG</button>
      </div>
      <div style={{height:220}}>
        <ChartJSReact ref={chartRef} type='scatter' data={scatter.data} options={scatter.options} />
      </div>
      {top && top.length>0 && (
        <div style={{maxHeight:180, overflowY:'auto', marginTop:8}}>
          {top.map((a,i)=> (
            <div key={i} className="row" style={{justifyContent:'space-between'}}>
              <div>{a.deviceName || a.deviceId}</div>
              <div>{new Date(a.ts).toLocaleString()}</div>
              <div><strong>{Number(a.value).toFixed?.(1)}</strong></div>
              <div className="badge" style={{borderColor:'#ef4444', color:'#ef4444'}}>z={Number(a.z).toFixed?.(2)}</div>
              <a className="btn" href={"/devices/" + encodeURIComponent(a.deviceId) + "?metric=P"}>↘</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
