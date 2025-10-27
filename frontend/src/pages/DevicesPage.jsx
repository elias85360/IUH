import { Link } from 'react-router-dom'
import { useAssets } from '../state/assets.js'
import { useEffect } from 'react'
import { useUiStore } from '../state/filters.js'
import { prefetchDevices } from '../lib/prefetch.js'
import DeviceSummaryCard from '../components/DeviceSummaryCard.jsx'

export default function DevicesPage({ devices }) {
  const { meta } = useAssets()
  const { period, selectedRoom, selectedGroup } = useUiStore()
  const visible = (devices||[]).filter(d => {
    const m = meta[d.id] || {}
    const group = (m.group || m.floor || '')
    const room = (m.room || d.room || '')
    if (selectedGroup && selectedGroup !== 'all' && group !== selectedGroup) return false
    if (selectedRoom && selectedRoom !== 'all' && room !== selectedRoom) return false
    return true
  })
  useEffect(()=>{
    if (!visible || !visible.length) return
    try { prefetchDevices(visible, { ms: period.ms }) } catch {}
  }, [visible, period])
  return ( 
    <div className="panel">
      <div className="panel-title">Devices</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr', gap:20}}>
        {visible.map(d => (
          <DeviceSummaryCard key={d.id} device={d} />
        ))}
      </div>
    </div>
  )
}
