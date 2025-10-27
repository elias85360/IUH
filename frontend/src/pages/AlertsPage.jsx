import { useEffect, useMemo, useState } from 'react'
import { useAlerts } from '../state/alerts.js'
import { format } from 'date-fns'

export default function AlertsPage() {
  const { log, clear } = useAlerts()

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Alerts Log</div>
        <div className="row" style={{gap:8}}>
          <button className="btn" onClick={clear}>Clear</button>
        </div> 
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
              <th>Time</th><th>Device</th><th>Metric</th><th>Value</th><th>Level</th>
            </tr>
          </thead>
          <tbody>
            {(log||[]).map((a) => (
              <tr key={a.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                <td>{a.ts? new Date(a.ts).toLocaleString() : ''}</td>
                <td>{a.deviceId}</td>
                <td>{a.metricKey}</td>
                <td>{Number(a.value).toFixed?.(2) ?? a.value}</td>
                <td><span className="badge" style={{borderColor: a.level==='crit'? '#ef4444':'#f59e0b', color: a.level==='crit'? '#ef4444':'#f59e0b'}}>{a.level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
