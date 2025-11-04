import { useSettings } from '../src/state/settings.js'
import { useUiStore } from '../src/state/filters.js'

export default function DeviceOptions({ deviceId }) {
  const { options, setOptions, getThreshold, setThreshold, resetDevice } = useSettings()
  const tKeys = ['U','I','P','E','F','pf','temp','humid']
  const t = Object.fromEntries(tKeys.map(k => [k, getThreshold(deviceId, k)]))
  const { anchorNow, refreshNow } = useUiStore()

  return (
    <div className="panel" style={{marginBottom:12}}>
      <div className="panel-header">
        <div className="panel-title">Options & Seuils</div>
        <div className="row" style={{gap:8}}>
          <button className="btn" onClick={refreshNow}>⟳ Rafraîchir</button>
          <button className="btn" onClick={()=>resetDevice(deviceId)}>Réinitialiser</button>
        </div> 
      </div>
      <div className="row" style={{gap:12, flexWrap:'wrap', marginBottom:12}}>
        <label className="row" style={{gap:6}}>
          Bucket (ms)
          <input className="input" style={{width:110}} type="number" value={options.bucketMs||''} onChange={(e)=>setOptions({ bucketMs: e.target.value? Number(e.target.value): undefined })} placeholder="auto"/>
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={options.smoothing} onChange={(e)=>setOptions({ smoothing: e.target.checked })}/> Lissage
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={options.highlightAnomalies} onChange={(e)=>setOptions({ highlightAnomalies: e.target.checked })}/> Anomalies
        </label>
        <span className="badge">Ancre: {new Date(anchorNow).toLocaleString()}</span>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
        {tKeys.map(k => (
          <div key={k} className="statcard">
            <div className="stat-title">{k}</div>
            <div className="row" style={{gap:6, marginTop:6}}>
              <label className="row" style={{gap:4}}>Warn <input className="input" style={{width:70}} type="number" value={t[k]?.warn ?? ''} onChange={(e)=>setThreshold(deviceId,k,{ warn: e.target.value===''? null : Number(e.target.value) })}/></label>
              <label className="row" style={{gap:4}}>Crit <input className="input" style={{width:70}} type="number" value={t[k]?.crit ?? ''} onChange={(e)=>setThreshold(deviceId,k,{ crit: e.target.value===''? null : Number(e.target.value) })}/></label>
            </div>
            {k==='pf' && (
              <div className="row" style={{gap:6, marginTop:6}}>
                <label className="row" style={{gap:4}}>Direction
                  <select className="select" value={t[k]?.direction||'above'} onChange={(e)=>setThreshold(deviceId,k,{ direction: e.target.value })}>
                    <option value="above">Au-dessus</option>
                    <option value="below">En-dessous</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

