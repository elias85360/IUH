import { useEffect, useMemo, useState } from 'react'
import { useAlerts } from '../state/alerts.js'
import { useAuth } from '../components/AuthProvider.jsx'
import { api } from '../services/api.js'
import { format } from 'date-fns'

export default function AlertsPage() {
  const { user } = useAuth()
  const { log, clear, ack, silence, acked, audit, closeGroup, routeSlack, routeWebhook, webhookUrl, slackChannel, setRouting } = useAlerts()
  const [level, setLevel] = useState('')
  const [q, setQ] = useState('')
  const [windowMin, setWindowMin] = useState(60)
  const actor = user?.email || user?.preferred_username || user?.sub || 'user'
  const ackedSet = useMemo(()=> new Set(Array.isArray(acked)? acked : ([])), [acked])
  // Sync routing with backend
  useEffect(()=>{
    (async()=>{
      try {
        const r = await fetch(api.getBaseUrl() + '/api/alerts/routing')
        if (!r.ok) return
        const conf = await r.json()
        setRouting({
          routeSlack: !!conf.routeSlack,
          routeWebhook: !!conf.routeWebhook,
          slackChannel: conf.slackChannel || '',
          webhookUrl: conf.webhookUrl || ''
        })
      } catch {}
    })()
  }, [])
  const filtered = useMemo(()=>{
    const L = level
    const query = q.trim().toLowerCase()
    let arr = (log||[])
    if (L) arr = arr.filter(a => a.level === L)
    if (query) arr = arr.filter(a => (a.deviceId||'').toLowerCase().includes(query) || (a.metricKey||'').toLowerCase().includes(query))
    return arr
  }, [log, level, q])
  const grouped = useMemo(()=>{
    const now = Date.now(); const winMs = Math.max(1, windowMin) * 60 * 1000
    const map = new Map()
    for (const a of filtered) {
      if (!a.ts) continue
      if ((now - Number(a.ts)) > winMs) continue
      const key = `${a.deviceId}::${a.metricKey}::${a.level}`
      const g = map.get(key) || { ...a, count: 0, items: [] }
      g.count += 1; g.items.push(a); g.latest = Math.max(g.latest||0, Number(a.ts))
      map.set(key, g)
    }
    return Array.from(map.values()).sort((a,b)=> (b.latest||0) - (a.latest||0))
  }, [filtered, windowMin])

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
      {/* Routing toggles (UI only) */}
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-title">Routing</div>
        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
          <label className="row" style={{gap:6}}>
            <input type="checkbox" checked={!!routeSlack} onChange={async (e)=>{
              const v = e.target.checked; setRouting({ routeSlack: v });
              try { await fetch(api.getBaseUrl() + '/api/alerts/routing', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ routeSlack: v }) }) } catch {}
            }} /> Slack
          </label>
          <input className="input" placeholder="#channel" style={{width:200}} value={slackChannel||''} onChange={async (e)=>{
            const v = e.target.value; setRouting({ slackChannel: v })
            try { await fetch(api.getBaseUrl() + '/api/alerts/routing', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ slackChannel: v }) }) } catch {}
          }} />
          <label className="row" style={{gap:6}}>
            <input type="checkbox" checked={!!routeWebhook} onChange={async (e)=>{
              const v = e.target.checked; setRouting({ routeWebhook: v })
              try { await fetch(api.getBaseUrl() + '/api/alerts/routing', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ routeWebhook: v }) }) } catch {}
            }} /> Webhook
          </label>
          <input className="input" placeholder="https://webhook" style={{width:340}} value={webhookUrl||''} onChange={async (e)=>{
            const v = e.target.value; setRouting({ webhookUrl: v })
            try { await fetch(api.getBaseUrl() + '/api/alerts/routing', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ webhookUrl: v }) }) } catch {}
          }} />
          <button className="btn" onClick={async()=>{
            try { await fetch(api.getBaseUrl() + '/api/alerts/test', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ level:'warn', deviceId:'test', metricKey:'P', value:1 }) }) } catch {}
          }}>Send test</button>
        </div>
      </div>
      <div className="panel" style={{marginTop:12}}>
        <div className="panel-title">Grouped (deduped)</div>
        {grouped.length === 0 && <div className="badge">No alerts in window</div>}
        {grouped.map((g)=> (
          <div key={`${g.deviceId}::${g.metricKey}::${g.level}`} className="row" style={{justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'6px 0'}}>
            <div>{g.deviceId} • {g.metricKey} • <span className="badge" style={{borderColor: g.level==='crit'? '#ef4444':'#f59e0b', color: g.level==='crit'? '#ef4444':'#f59e0b'}}>{g.level}</span></div>
            <div className="row" style={{gap:8}}>
              <span className="badge">{g.count}</span>
              <button className="btn" onClick={()=>silence(g.deviceId, g.metricKey, 60*60*1000, actor)}>Silence 1h</button>
              <button className="btn" onClick={()=>{ closeGroup(g.deviceId, g.metricKey, actor) }}>Close group</button>
              <button className="btn" onClick={()=>{ for (const a of g.items) ack(a.id, actor) }}>Acknowledge</button>
            </div>
          </div>
        ))}
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
