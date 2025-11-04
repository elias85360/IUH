import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { fetchEnergyBuckets } from '../lib/energy.js'
import SkeletonBox from './SkeletonBox.jsx'

const COLORS = ['#2563eb','#22c55e','#a78bfa','#f59e0b','#ef4444','#06b6d4','#84cc16']

export default function RoomContribution({ devices = [], onSelectRoom }) {
  const { anchorNow, period } = useUiStore()
  const { meta } = useAssets()

  const [rows, setRows] = useState([])
  const [relative, setRelative] = useState(false)

  // Regrouper les devices par room
  const groups = useMemo(() => {
    const map = new Map()
    for (const d of devices) {
      const m = meta[d.id] || {}
      const room = (m.room || d.room || '—')
      if (!map.has(room)) map.set(room, [])
      map.get(room).push(d)
    }
    return Array.from(map.entries()) // [room, device[]]
  }, [devices, meta])

  useEffect(() => {
    let cancel = false
    async function run() {
      const from = anchorNow - period.ms
      const to = anchorNow
      const bucketMs = Math.max(60 * 60 * 1000, Math.floor((to - from) / 24))
      const out = []
      for (const [room, devs] of groups) {
        let kwh = 0
        for (const d of devs) {
          const b = await fetchEnergyBuckets([d], from, to, bucketMs)
          kwh += b.reduce((s, r) => s + r.kwh, 0)
        }
        out.push({ room, kwh })
      }
      out.sort((a, b) => b.kwh - a.kwh)
      if (!cancel) setRows(out)
    }
    run()
    return () => { cancel = true }
  }, [groups, anchorNow, period])

  const total = rows.reduce((s, r) => s + r.kwh, 0)
  const view = relative && total > 0
    ? rows.map(r => ({ ...r, kwh: (r.kwh / total) * 100 }))
    : rows

  // Thème clair cohérent avec styles.css
  const GRID = '#e5e7eb'
  const AXIS = '#64748b'

  const tooltipStyle = useMemo(() => ({
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
  }), [])

  return (
    <div className="tile-room-chart">
      <button
        className="chip"
        onClick={() => setRelative((v) => !v)}
        style={{ position: 'absolute', right: 12, top: 8, zIndex: 2 }}
        title={relative ? 'Afficher en kWh (absolu)' : 'Afficher en % (relatif)'}
      >
        {relative ? 'Absolu' : '% Relatif'}
      </button>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={view}
          margin={{ top: 32, right: 24, left: 24, bottom: 24 }}
        >
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="room"
            stroke={AXIS}
            tickLine={false}
            axisLine={{ stroke: AXIS }}
          />
          <YAxis
            stroke={AXIS}
            tickLine={false}
            axisLine={{ stroke: AXIS }}
            tickFormatter={(v) => relative ? `${v.toFixed(0)}%` : v.toFixed(1)}
          />
          <Tooltip
            formatter={(v) => relative ? [Number(v).toFixed(1), '%'] : [Number(v).toFixed(1), 'kWh']}
            labelFormatter={(label) => label}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'rgba(37,99,235,0.08)' }}
          />
          <Bar
            dataKey="kwh"
            fill={COLORS[0]}
            radius={[6, 6, 0, 0]}
            barSize={32}
            onClick={(entry) => {
              const room = entry?.room ?? entry?.payload?.room
              if (room && onSelectRoom) onSelectRoom(room)
            }}
            cursor={onSelectRoom ? 'pointer' : 'default'}
          />
        </BarChart>
      </ResponsiveContainer>

      {(!rows || rows.length === 0) && <SkeletonBox height={'100%'} />}
    </div>
  )
}
