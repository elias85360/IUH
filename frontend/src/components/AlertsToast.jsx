import { useAlerts } from '../state/alerts.js'

export default function AlertsToast() {
  const { toasts: items } = useAlerts()
  if (!items || !items.length) return null
  return (
    <div style={{position:'fixed', right:12, bottom:12, display:'flex', flexDirection:'column', gap:8, zIndex:1000}}>
      {items.map((a, idx)=> (
        <div key={idx} style={{background:'#0b1220', border:'1px solid #374151', borderLeft:`4px solid ${a.level==='crit'?'#ef4444':'#f59e0b'}`, padding:'8px 10px', borderRadius:8, minWidth:260}}>
          <div style={{fontWeight:600}}>{a.level.toUpperCase()} • {a.deviceId} / {a.metricKey}</div>
          <div style={{color:'#9ca3af'}}>Valeur: {Number(a.value).toFixed(2)} • {new Date(a.ts).toLocaleTimeString()}</div>
        </div>
      ))}
    </div> 
  )
}
