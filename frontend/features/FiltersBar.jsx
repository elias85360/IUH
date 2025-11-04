import { useUiStore, PERIODS } from '../src/state/filters.js'

export default function FiltersBar() {
  const { period, setPeriodKey, selectedRoom, setFilters, devices, metrics, selectedTypes, selectedMetrics, selectedDevices } = useUiStore()

  const rooms = ['all', ...Array.from(new Set(devices.map(d=>d.room)))]
  const types = Array.from(new Set(devices.map(d=>d.type)))

  return (
    <div className="toolbar">
      <select className="select" value={period.key} onChange={(e)=>setPeriodKey(e.target.value)}>
        {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>

      <select className="select" value={selectedRoom} onChange={(e)=>setFilters({selectedRoom: e.target.value})}>
        {rooms.map(r => <option key={r} value={r}>{r}</option>)}
      </select>

      <select className="select" multiple size={1+Math.min(types.length, 4)} value={selectedTypes} onChange={(e)=>{
        const opts = Array.from(e.target.selectedOptions).map(o=>o.value); setFilters({selectedTypes: opts})
      }}>
        {types.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select className="select" multiple size={1+Math.min(metrics.length, 4)} value={selectedMetrics} onChange={(e)=>{
        const opts = Array.from(e.target.selectedOptions).map(o=>o.value); setFilters({selectedMetrics: opts})
      }}> 
        {metrics.map(m => <option key={m.key} value={m.key}>{m.displayName} ({m.unit})</option>)}
      </select>

      <select className="select" multiple size={1+Math.min(devices.length, 4)} value={selectedDevices} onChange={(e)=>{
        const opts = Array.from(e.target.selectedOptions).map(o=>o.value); setFilters({selectedDevices: opts})
      }}>
        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      <span className="badge">Filtres</span>
    </div>
  )
}

