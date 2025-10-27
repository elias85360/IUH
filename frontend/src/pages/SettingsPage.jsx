import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../state/settings.js'
import { useUiStore } from '../state/filters.js'
import { api } from '../services/api.js'

export default function SettingsPage() {
  const { options, setOptions, getThreshold, setThreshold } = useSettings()
  const { period, setPeriodKey, refreshNow, devices } = useUiStore()
  const metrics = ['U','I','P','E','F','pf','temp','humid']
  const [tab, setTab] = useState('global') // global | devices
  const [defaults, setDefaults] = useState({})
  const [kpis, setKpis] = useState({})

  useEffect(()=>{ (async()=>{ try { const s = await api.getThresholds(); setDefaults(s.global||{}) } catch {} })() }, [])
  useEffect(()=>{ (async()=>{ const out={}; for (const d of devices){ try{ const r=await api.kpis(d.id); out[d.id]=r.kpis||{} }catch{} } setKpis(out) })() }, [devices])

  return (
    <div className="panel">
      <div className="panel-title">Settings</div>
      <div className="row" style={{gap:8, marginBottom:8}}>
        <button className={`btn ${tab==='global'?'primary':''}`} onClick={()=>setTab('global')}>Global</button>
        <button className={`btn ${tab==='devices'?'primary':''}`} onClick={()=>setTab('devices')}>Devices</button>
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
    </div>
  )
}
