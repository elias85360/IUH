import { useMemo, useState } from 'react'
import { useAlerts } from '../state/alerts.js'
import { useAuth } from '../components/AuthProvider.jsx'

export default function AlertsPage() {
  const { user } = useAuth()
  const { log, clear, ack, silence, acked, audit } = useAlerts()
  const [level, setLevel] = useState('')
  const [q, setQ] = useState('')
  const [windowMin, setWindowMin] = useState(60)
  const actor = user?.email || user?.preferred_username || user?.sub || 'user'
  const ackedSet = useMemo(()=> new Set(Array.isArray(acked)? acked : ([])), [acked])
  const filtered = useMemo(()=>{
    const L = level
    const query = q.trim().toLowerCase()
    const now = Date.now()
    const windowValue = Number(windowMin)
    const windowMs = windowValue > 0 ? windowValue * 60 * 1000 : null
    let arr = (log||[])
    if (L) arr = arr.filter(a => a.level === L)
    if (query) arr = arr.filter(a => (a.deviceId||'').toLowerCase().includes(query) || (a.metricKey||'').toLowerCase().includes(query))
    if (windowMs != null) {
      arr = arr.filter(a => a.ts && (now - Number(a.ts)) <= windowMs)
    }
    return arr
  }, [log, level, q, windowMin])
  const summary = useMemo(() => {
    const total = filtered.length
    const unacked = filtered.reduce((acc, alert) => acc + (ackedSet.has(alert.id) ? 0 : 1), 0)
    const latestTs = filtered[0]?.ts
    return {
      total,
      unacked,
      latest: latestTs ? new Date(latestTs).toLocaleString() : '—',
    }
  }, [filtered, ackedSet])

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Alerts Log</div>
        <div className="row" style={{gap:8}}>
          <input className="input" placeholder="Filter device/metric" value={q} onChange={(e)=>setQ(e.target.value)} />
          <select className="select" value={level} onChange={(e)=>setLevel(e.target.value)}>
            <option value="">All</option>
            <option value="warn">Warn</option>
            <option value="crit">Crit</option>
          </select>
          <label className="row" style={{gap:6}}>
            Window
            <select className="select" value={windowMin} onChange={(e)=>setWindowMin(Number(e.target.value))}>
              <option value={15}>15 min</option>
              <option value={60}>1 h</option>
              <option value={360}>6 h</option>
              <option value={1440}>24 h</option>
              <option value={0}>Tout</option>
            </select>
          </label>
          <button className="btn" onClick={()=>clear(actor)}>Clear</button>
          <button className="btn" onClick={()=>{
            try {
              const rows = (log||[])
              const header = ['ts','deviceId','metricKey','value','level','id']
              const lines = [header.join(',')]
              for (const a of rows) lines.push([a.ts, a.deviceId, a.metricKey, a.value, a.level, a.id].join(','))
              const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
              const el = document.createElement('a'); el.href = url; el.download = 'alerts.csv'; el.click(); URL.revokeObjectURL(url)
            } catch {}
          }}>Export CSV</button>
          <button className="btn" onClick={()=>{
            try {
              const blob = new Blob([JSON.stringify({ log, audit })], { type: 'application/json' }); const url = URL.createObjectURL(blob)
              const el = document.createElement('a'); el.href = url; el.download = 'alerts.json'; el.click(); URL.revokeObjectURL(url)
            } catch {}
          }}>Export JSON</button>
        </div> 
      </div>
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-title">Summary</div>
        <div className="row" style={{gap:12, flexWrap:'wrap'}}>
          <div className="badge">Total: {summary.total}</div>
          <div className="badge" style={{borderColor:'#f97316', color:'#f97316'}}>No ack: {summary.unacked}</div>
          <div className="badge">Last alert: {summary.latest}</div>
          {windowMin ? <div className="badge">Window: {windowMin} min</div> : <div className="badge">Window: all</div>}
        </div>
      </div>
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-title">All</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
                <th>Time</th><th>Device</th><th>Metric</th><th>Value</th><th>Level</th><th>Ack</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(filtered||[]).map((a) => (
                <tr key={a.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td>{a.ts? new Date(a.ts).toLocaleString() : ''}</td>
                  <td>{a.deviceId}</td>
                  <td>{a.metricKey}</td>
                  <td>{Number(a.value).toFixed?.(2) ?? a.value}</td>
                  <td><span className="badge" style={{borderColor: a.level==='crit'? '#ef4444':'#f59e0b', color: a.level==='crit'? '#ef4444':'#f59e0b'}}>{a.level}</span></td>
                  <td>{ackedSet.has(a.id) ? '✓' : ''}</td>
                  <td>
                    <button className="btn" onClick={()=>ack(a.id, actor)} disabled={ackedSet.has(a.id)}>Ack</button>
                    <button className="btn" onClick={()=>silence(a.deviceId, a.metricKey, 60*60*1000, actor)}>Silence 1h</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-title">Audit trail</div>
        {(!audit || audit.length===0) && <div className="badge">No audit entries</div>}
        {(audit||[]).slice(0,50).map((e,idx)=> (
          <div key={idx} className="row" style={{justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'6px 0'}}>
            <div>{new Date(e.ts).toLocaleString()}</div>
            <div>{e.action}</div>
            <div>{e.deviceId ? `${e.deviceId} • ${e.metricKey||''}` : ''}</div>
            <div>{e.user||''}</div>
            {e.count!=null && <div><span className="badge">{e.count}</span></div>}
          </div>
        ))}
      </div>
    </div>
  )
}
