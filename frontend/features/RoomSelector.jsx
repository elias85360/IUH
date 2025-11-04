import { useMemo } from 'react'
import { useUiStore } from '../src/state/filters.js'
import { useAssets } from '../src/state/assets.js'

export default function RoomSelector({ devices=[] }) {
  const { selectedRoom, setFilters } = useUiStore()
  const { meta } = useAssets()

  const rooms = useMemo(()=>{
    const set = new Set(['all'])
    for (const d of devices) {
      const m = meta[d.id] || {}
      const r = m.room || d.room
      if (r && typeof r === 'string' && r.trim()) set.add(r.trim())
    }
    return Array.from(set)
  }, [devices, meta])

  return ( 
    <div className="row" style={{gap:8}}>
      <label className="row" style={{gap:6}}>
        <span className="badge">Room</span>
        <select className="select" value={selectedRoom || 'all'} onChange={(e)=>setFilters({ selectedRoom: e.target.value })}>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
    </div>
  )
}

