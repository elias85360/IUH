import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../state/settings.js'
import { useUiStore } from '../state/filters.js'
import { api } from '../services/api.js'

export default function SettingsPage() {
  const { options, setOptions, getThreshold, setThreshold } = useSettings()
  const { period, setPeriodKey, refreshNow, devices } = useUiStore()
  const metrics = ['U','I','P','E','F','pf','temp','humid']
  const [tab, setTab] = useState('global') // global | devices | integrations | auth | flags | apikey | wizard
  const [defaults, setDefaults] = useState({})
  const [deadbandPct, setDeadbandPct] = useState('')
  const [kpis, setKpis] = useState({})
  const [status, setStatus] = useState(null)
  const [testKey, setTestKey] = useState('')
  const [wiz, setWiz] = useState({ scope: 'all', warnPct: 20, critPct: 40, metrics: ['P','U','I','temp','pf'] })

  useEffect(()=>{ (async()=>{ try { const s = await api.getThresholds(); setDefaults(s.global||{}); setDeadbandPct(String(s?.options?.deadbandPct ?? '')) } catch {} })() }, [])
  useEffect(()=>{ (async()=>{ const out={}; for (const d of devices){ try{ const r=await api.kpis(d.id); out[d.id]=r.kpis||{} }catch{} } setKpis(out) })() }, [devices])
  useEffect(()=>{ (async()=>{ try { const s = await api.adminStatus(); setStatus(s) } catch {} })() }, [])

  return (
    <div className="panel">
      <div className="panel-title">Settings</div>
      <div className="row" style={{gap:8, marginBottom:8}}>
        <button className={`btn ${tab==='global'?'primary':''}`} onClick={()=>setTab('global')}>Global</button>
        <button className={`btn ${tab==='devices'?'primary':''}`} onClick={()=>setTab('devices')}>Devices</button>
        <button className={`btn ${tab==='integrations'?'primary':''}`} onClick={()=>setTab('integrations')}>Integrations</button>
        <button className={`btn ${tab==='flags'?'primary':''}`} onClick={()=>setTab('flags')}>Feature flags</button>
        <button className={`btn ${tab==='auth'?'primary':''}`} onClick={()=>setTab('auth')}>Auth & Roles</button>
        <button className={`btn ${tab==='apikey'?'primary':''}`} onClick={()=>setTab('apikey')}>API key</button>
        <button className={`btn ${tab==='wizard'?'primary':''}`} onClick={()=>setTab('wizard')}>Thresholds wizard</button>
      </div>

      {tab==='global' && (
      <>
      <div className="panel-title">Global Options</div>
      <div className="row" style={{gap:12, flexWrap:'wrap'}}>
        <label className="row" style={{gap:6}}>
          Default bucket (ms)
          <input className="input" style={{width:120}} type="number" value={options.bucketMs||''} onChange={(e)=>setOptions({ bucketMs: e.target.value? Number(e.target.value): undefined })} placeholder="auto"/>
        </label> 
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={options.smoothing} onChange={(e)=>setOptions({ smoothing: e.target.checked })}/> Smoothing (moving average)
        </label>
        <label className="row" style={{gap:6}}>
          Mode
          <select className="select" value={options.smoothingMode} onChange={(e)=>setOptions({ smoothingMode: e.target.value })}>
            <option value="SMA">SMA</option>
            <option value="EMA">EMA</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Window
          <input className="input" style={{width:80}} type="number" min={1} value={options.smoothingWindow||5} onChange={(e)=>setOptions({ smoothingWindow: Number(e.target.value||5) })} />
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={options.highlightAnomalies} onChange={(e)=>setOptions({ highlightAnomalies: e.target.checked })}/> Highlight anomalies
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={!!options.showBaseline} onChange={(e)=>setOptions({ showBaseline: e.target.checked })}/> Show baseline
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={!!options.showForecast} onChange={(e)=>setOptions({ showForecast: e.target.checked })}/> Show forecast
        </label>
        <label className="row" style={{gap:6}}>
          Y scale
          <select className="select" value={options.yScale} onChange={(e)=>setOptions({ yScale: e.target.value })}>
            <option value="linear">linear</option>
            <option value="log">log</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Theme
          <select className="select" value={options.theme} onChange={(e)=>{
            setOptions({ theme: e.target.value });
            try { document.documentElement.setAttribute('data-theme', e.target.value) } catch {}
          }}>
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Language
          <select className="select" value={options.lang} onChange={(e)=>setOptions({ lang: e.target.value })}>
            <option value="fr">fr</option>
            <option value="en">en</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Deadband (%)
          <input className="input" style={{width:80}} type="number" min={0} max={50} step={0.5} value={deadbandPct}
            onChange={(e)=>setDeadbandPct(e.target.value)} placeholder="5" />
          <button className="btn" onClick={async()=>{ try { const v=Number(deadbandPct); if (!Number.isFinite(v)||v<0){ alert('Valeur invalide'); return } await api.putThresholds({ options: { deadbandPct: v } }); alert('Deadband mis à jour') } catch { alert('Échec de mise à jour') } }}>Save</button>
        </label>
        <label className="row" style={{gap:6}}>
          Period
          <select className="select" value={period.key} onChange={(e)=>setPeriodKey(e.target.value)}>
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
          </select>
        </label>
        <button className="btn" onClick={refreshNow}>⟳ Re-anchor time</button>
      </div>

      <div className="panel" style={{marginTop:16}}>
        <div className="panel-title">Default Thresholds</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
                <th>Metric</th><th>Direction</th><th>Warn</th><th>Crit</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td>{m}</td>
                  <td>
                    <select className="select" value={(defaults[m]?.direction)|| (m==='pf'?'below':'above')} onChange={(e)=>setDefaults(prev=>({ ...prev, [m]: { ...(prev[m]||{}), direction: e.target.value } }))}>
                      <option value="above">above</option>
                      <option value="below">below</option>
                    </select>
                  </td>
                  <td><input className="input" style={{width:90}} type="number" value={defaults[m]?.warn ?? ''} onChange={(e)=>setDefaults(prev=>({ ...prev, [m]: { ...(prev[m]||{}), warn: e.target.value===''? null : Number(e.target.value) } }))} /></td>
                  <td><input className="input" style={{width:90}} type="number" value={defaults[m]?.crit ?? ''} onChange={(e)=>setDefaults(prev=>({ ...prev, [m]: { ...(prev[m]||{}), crit: e.target.value===''? null : Number(e.target.value) } }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{gap:8, marginTop:8}}>
          <button className="btn" onClick={async()=>{ try { await api.putThresholds({ global: defaults }); alert('Defaults saved') } catch { alert('Save failed') } }}>Save defaults</button>
          <button className="btn" onClick={async()=>{ try { const s=await api.getThresholds(); setDefaults(s.global||{}) } catch {} }}>Reload</button>
        </div>
      </div>
      </>
      )}

      {tab==='devices' && (
      <div style={{marginTop:16}} className="panel">
        <div className="panel-title">Thresholds per device</div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{textAlign:'left', borderBottom:'1px solid #e5e7eb'}}>
                <th>Device</th>
                {metrics.map(m=> <th key={m}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td>{d.name}</td>
                  {metrics.map(m => {
                    const th = getThreshold(d.id, m)
                    const last = kpis[d.id]?.[m]?.last
                    const dir = th?.direction || (m==='pf'?'below':'above')
                    return (
                      <td key={`${d.id}-${m}`}>
                        <div className="row" style={{gap:6, alignItems:'center'}}>
                          <span className={`status-chip ${(()=>{ if (last==null) return ''; if (dir==='below'){ if (th?.crit!=null && last<=th.crit) return 'crit'; if (th?.warn!=null && last<=th.warn) return 'warn'; return 'ok'} else { if (th?.crit!=null && last>=th.crit) return 'crit'; if (th?.warn!=null && last>=th.warn) return 'warn'; return 'ok' } })()}`}></span>
                          <input className="input" style={{width:70}} type="number" value={th?.warn ?? ''} placeholder="warn" onChange={(e)=>setThreshold(d.id, m, { warn: e.target.value===''? null : Number(e.target.value) })} />
                          <input className="input" style={{width:70}} type="number" value={th?.crit ?? ''} placeholder="crit" onChange={(e)=>setThreshold(d.id, m, { crit: e.target.value===''? null : Number(e.target.value) })} />
                          <select className="select" value={dir} onChange={(e)=>setThreshold(d.id, m, { direction: e.target.value })}>
                            <option value="above">↑</option>
                            <option value="below">↓</option>
                          </select>
                          <button className="btn" title="Reset to defaults" onClick={async()=>{ try{ await api.putThresholds({ devices: { [d.id]: null } }); alert('Reset'); }catch{} }}>↺</button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab==='integrations' && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">Integrations</div>
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <div className="badge">Slack: {status?.ROUTE_SLACK? 'on':'off'}</div>
            <div className="badge">Webhook: {status?.ROUTE_WEBHOOK? 'on':'off'}</div>
            <div className="badge">SMTP: {status?.SMTP_CONFIGURED? 'configured':'off'}</div>
            <button className="btn" onClick={async()=>{ try { await api.adminAlertsTest({ deviceId:'test', metricKey:'P', value:1, level:'warn' }); alert('Test sent') } catch { alert('Test failed') } }}>Send test</button>
          </div>
        </div>
      )}

      {tab==='flags' && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">Feature flags</div>
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <div className="badge">TSDB_READ: {status?.TSDB_READ? 'on':'off'}</div>
            <div className="badge">TSDB_MIRROR: {status?.TSDB_MIRROR? 'on':'off'}</div>
            <div className="badge">FORECAST_URL: {status?.FORECAST_URL? 'on':'off'}</div>
            <div className="badge">DATA_SOURCE: {status?.DATA_SOURCE || 'mock'}</div>
            <div className="badge">API_HMAC_ENFORCE: {status?.API_HMAC_ENFORCE? 'on':'off'}</div>
          </div>
          <div className="row" style={{gap:8, marginTop:12}}>
            <button className="btn" onClick={async()=>{ try { await api.hmacTest(); alert('HMAC ok') } catch { alert('HMAC failed (check VITE_API_HMAC_* and server)') } }}>Test HMAC</button>
          </div>
        </div>
      )}

      {tab==='auth' && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">Auth & Roles</div>
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <div className="badge">RBAC_ENFORCE: {status?.RBAC_ENFORCE? 'on':'off'}</div>
            <div className="badge">ALLOW_API_KEY_WITH_RBAC: {status?.ALLOW_API_KEY_WITH_RBAC? 'on':'off'}</div>
          </div>
          <div style={{marginTop:8}}>
            <pre style={{whiteSpace:'pre-wrap', background:'rgba(255,255,255,0.06)', padding:12, borderRadius:8}}>{JSON.stringify(status, null, 2)}</pre>
          </div>
        </div>
      )}

      {tab==='apikey' && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">API key manager (read-only)</div>
          <div className="row" style={{gap:8, flexWrap:'wrap'}}>
            <div className="badge">API_KEY_PRESENT: {status?.API_KEY_PRESENT? 'yes':'no'}</div>
          </div>
          <div className="row" style={{gap:8, marginTop:12}}>
            <input className="input" placeholder="Test with Bearer key" style={{width:260}} value={testKey} onChange={(e)=>setTestKey(e.target.value)} />
            <button className="btn" onClick={async()=>{ try{ const r=await api.adminPing(testKey); if (r && r.ok) alert('API key valid'); else alert('Invalid or not enabled'); }catch{ alert('Failed') } }}>Test key</button>
          </div>
          <div className="badge" style={{marginTop:8}}>Note: generation/rotation côté serveur requiert configuration et redéploiement.</div>
        </div>
      )}

      {tab==='wizard' && (
        <div className="panel" style={{marginTop:16}}>
          <div className="panel-title">Thresholds Wizard</div>
          <div className="row" style={{gap:12, flexWrap:'wrap'}}>
            <label className="row" style={{gap:6}}>
              Scope
              <select className="select" value={wiz.scope} onChange={(e)=>setWiz({...wiz, scope: e.target.value})}>
                <option value="all">All devices</option>
                <option value="room">By room</option>
                <option value="type">By type (tag/type)</option>
              </select>
            </label>
            <label className="row" style={{gap:6}}>
              Warn +%
              <input className="input" style={{width:90}} type="number" value={wiz.warnPct} onChange={(e)=>setWiz({...wiz, warnPct: Number(e.target.value||0)})} />
            </label>
            <label className="row" style={{gap:6}}>
              Crit +%
              <input className="input" style={{width:90}} type="number" value={wiz.critPct} onChange={(e)=>setWiz({...wiz, critPct: Number(e.target.value||0)})} />
            </label>
            <label className="row" style={{gap:6}}>
              Metrics
              <input className="input" style={{width:220}} placeholder="e.g. P,U,I,temp,pf" value={wiz.metrics.join(',')} onChange={(e)=>setWiz({...wiz, metrics: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
            </label>
            <button className="btn" onClick={async()=>{
              try {
                const updates = {}
                for (const d of devices) {
                  const dev = d
                  const base = kpis[dev.id] || {}
                  const entry = {}
                  for (const m of wiz.metrics) {
                    const info = base[m]
                    if (!info) continue
                    const dir = (m==='pf') ? 'below' : 'above'
                    if (dir==='above') {
                      const warn = Number(info.avg || info.last || 0) * (1 + wiz.warnPct/100)
                      const crit = Number(info.avg || info.last || 0) * (1 + wiz.critPct/100)
                      entry[m] = { direction: dir, warn: Math.round(warn*100)/100, crit: Math.round(crit*100)/100 }
                    } else {
                      const warn = Number(info.avg || info.last || 0) * (1 - wiz.warnPct/100)
                      const crit = Number(info.avg || info.last || 0) * (1 - wiz.critPct/100)
                      entry[m] = { direction: dir, warn: Math.round(warn*100)/100, crit: Math.round(crit*100)/100 }
                    }
                  }
                  if (Object.keys(entry).length) updates[dev.id] = entry
                }
                await api.putThresholds({ devices: updates })
                alert('Wizard applied')
              } catch { alert('Apply failed') }
            }}>Apply to all</button>
          </div>
          <div className="badge" style={{marginTop:8}}>Tip: adjust deadband in Global Options to reduce flapping.</div>
        </div>
      )}
    </div>
  )
}
