import { useMemo } from 'react'
import { useUiStore } from '../state/filters.js'

export default function AdvancedFilters() {
  const {
    live,
    toggleLive,
    bucketMs,
    setBucketMs,
    smoothing, 
    toggleSmoothing,
    highlightAnomalies,
    toggleHighlight,
    devices,
    setFilters,
    selectedTags,
    pageSize,
    setPageSize,
    searchDevice,
    setSearchDevice,
    chartType,
    setChartType,
    aggregation,
    setAggregation,
    valueMin,
    setValueMin,
    valueMax,
    setValueMax,
  } = useUiStore()

  const allTags = useMemo(()=> Array.from(new Set(devices.flatMap(d=>d.tags||[]))), [devices])

  return (
    <div className="toolbar" style={{justifyContent:'space-between'}}>
      <div className="row" style={{gap:8, flexWrap:'wrap'}}>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={live} onChange={toggleLive} /> Live
        </label>
        <label className="row" style={{gap:6}}>
          Bucket (ms):
          <input className="input" style={{width:110}} type="number" min="0" placeholder="auto" value={bucketMs||''} onChange={(e)=>setBucketMs(e.target.value? Number(e.target.value): undefined)} />
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={smoothing} onChange={toggleSmoothing} /> Lissage
        </label>
        <label className="row" style={{gap:6}}>
          <input type="checkbox" checked={highlightAnomalies} onChange={toggleHighlight} /> Anomalies
        </label>
        <label className="row" style={{gap:6}}>
          Chart:
          <select className="select" value={chartType} onChange={(e)=>setChartType(e.target.value)}>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="scatter">Scatter</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Page size:
          <input className="input" style={{width:70}} type="number" min="4" max="24" value={pageSize} onChange={(e)=>setPageSize(Number(e.target.value||8))}/>
        </label>
        <label className="row" style={{gap:6}}>
          Agrégation:
          <select className="select" value={aggregation || 'auto'} onChange={(e)=>{
            const val = e.target.value
            setAggregation(val)
            // translate into bucketMs: use minutes/hours/days for resolution
            if (!val || val==='auto') setBucketMs(undefined)
            else if (val==='1min') setBucketMs(60*1000)
            else if (val==='10min') setBucketMs(10*60*1000)
            else if (val==='hour') setBucketMs(60*60*1000)
            else if (val==='day') setBucketMs(24*60*60*1000)
            else if (val==='week') setBucketMs(7*24*60*60*1000)
            else if (val==='month') setBucketMs(30*24*60*60*1000)
          }}>
            <option value="auto">auto</option>
            <option value="1min">1 min</option>
            <option value="10min">10 min</option>
            <option value="hour">heure</option>
            <option value="day">jour</option>
            <option value="week">semaine</option>
            <option value="month">mois</option>
          </select>
        </label>
        <label className="row" style={{gap:6}}>
          Valeur min:
          <input className="input" style={{width:80}} type="number" placeholder="min" value={valueMin} onChange={(e)=>setValueMin(e.target.value)} />
        </label>
        <label className="row" style={{gap:6}}>
          Valeur max:
          <input className="input" style={{width:80}} type="number" placeholder="max" value={valueMax} onChange={(e)=>setValueMax(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{gap:8}}>
        <input className="input" placeholder="Rechercher device..." value={searchDevice} onChange={(e)=>setSearchDevice(e.target.value)} />
        <select className="select" multiple size={1+Math.min(allTags.length,4)} value={selectedTags} onChange={(e)=>{
          const opts = Array.from(e.target.selectedOptions).map(o=>o.value)
          setFilters({ selectedTags: opts })
        }}>
          {allTags.map(t=> <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  )
}
