import { useUiStore } from '../state/filters.js'

const ONE_H = 60*60*1000
const ONE_D = 24*ONE_H

export default function PeriodTabs() {
  const { setFilters, period } = useUiStore()
  const set = (key) => {
    const map = {
      today: { key:'24h', label:'24h', ms: ONE_D },
      '7d': { key:'7d', label:'7d', ms: 7*ONE_D },
      '1m': { key:'1m', label:'1m', ms: 30*ONE_D },
      '3m': { key:'3m', label:'3m', ms: 90*ONE_D },
    }
    const p = map[key]
    setFilters({ period: p, anchorNow: Date.now() })
  }
  const active = period?.key || '24h'
  const btn = (k, label) => ( 
    <button className="btn" onClick={()=>set(k)} style={{ background: active===k || active===label? 'rgba(91,188,255,0.2)':'', borderColor:'rgba(255,255,255,0.1)'}}>{label}</button>
  )
  return (
    <div className="row" style={{gap:8}}>
      {btn('today','Today')}
      {btn('7d','7d')}
      {btn('1m','1m')}
      {btn('3m','3m')}
    </div>
  )
}

