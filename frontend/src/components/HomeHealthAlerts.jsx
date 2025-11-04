import { useEffect, useState, useMemo } from 'react'
import { api } from '../services/api.js'
import SkeletonBox from './SkeletonBox.jsx'

export default function HomeHealthAlerts() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let cancel = false
    async function run(){
      try{
        const now = Date.now()
        const from = now - 24*60*60*1000
        const res = await api.quality({ from, to: now, bucketMs: 60*60*1000 })
        if (!cancel && res && Array.isArray(res.items)) {
          setItems(res.items)
        }
      } catch {/* noop */}
      if (!cancel) setLoading(false)
    }
    run()
    return ()=>{ cancel = true }
  }, [])

  const worst = useMemo(()=>{
    const arr = (items||[]).slice()
    arr.sort((a,b)=>{
      const fa = a.freshnessMs||0, fb = b.freshnessMs||0
      const ca = 1-(a.completeness||0), cb = 1-(b.completeness||0)
      return (fb + cb) - (fa + ca)
    })
    return arr.slice(0,5)
  }, [items])

  if (loading) {
    return (
      <div>
        <SkeletonBox height={32} style={{ marginBottom:8 }} />
        <SkeletonBox height={32} style={{ marginBottom:8 }} />
        <SkeletonBox height={32} />
      </div>
    )
  }

  if (!worst || worst.length === 0) {
    return <span className="badge">OK</span>
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {worst.map((r, i) => {
        const freshness = r.freshnessMs == null ? Infinity : r.freshnessMs
        const cls = freshness > 6*60*60*1000 ? 'crit' : (freshness > 60*60*1000 ? 'warn' : 'ok')
        const pct = Math.round((r.completeness||0) * 100)
        return (
          <div
            key={`${r.deviceId}-${r.metricKey}-${i}`}
            className="row"
            style={{
              justifyContent:'space-between',
              alignItems:'center',
              padding:'8px 0',
              borderBottom: i < worst.length - 1 ? '1px solid #e5e7eb' : 'none'
            }}
          >
            <div style={{ color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {(r.deviceName || r.deviceId)} • {r.metricKey}
            </div>
            <div className="row" style={{ gap:8, alignItems:'center' }}>
              <span className={'status-chip ' + cls}>{freshness===Infinity ? '—' : fmtMs(freshness)}</span>
              <span className="badge">{pct}%</span>
              <a
                className="btn"
                href={`/devices/${encodeURIComponent(r.deviceId)}?metric=${encodeURIComponent(r.metricKey)}`}
                title="Voir le détail"
                aria-label="Voir le détail"
              >
                →
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function fmtMs(ms){
  if (ms == null || ms === Infinity) return '—'
  const s = Math.floor(ms/1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s/60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m/60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h/24)
  return `${d}d`
}
