import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList
} from 'recharts'
import { api } from '../services/api.js'
import { useUiStore } from '../state/filters.js'
import { unitForMetric, toDisplay } from '../lib/format.js'
import SkeletonBox from './SkeletonBox.jsx'

export default function ActiveDevicesBars({ devices, top = 6, onSelectDevice }) {
  const { anchorNow, period } = useUiStore()
  const from = anchorNow - period.ms
  const to = anchorNow

  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancel = false
    async function run() {
      const bucketMs = Math.max(60 * 60 * 1000, Math.floor((to - from) / 24))
      const list = []
      for (const d of devices) {
        const r = await api.timeseries(d.id, 'P', { from, to, bucketMs })
        const pts = r.points || []
        const avg = pts.reduce((s, pt) => s + Number(pt.value || 0), 0) / Math.max(1, pts.length)
        list.push({ id: d.id, name: d.name, value: avg })
      }
      list.sort((a, b) => b.value - a.value)
      if (!cancel) setRows(list.slice(0, top))
    }
    run()
    return () => { cancel = true }
  }, [devices, from, to, top])

  const GRID = '#e5e7eb'
  const AXIS = '#64748b'
  const BAR  = '#2563eb'

  const unit = unitForMetric('P')

  const tooltipStyle = useMemo(() => ({
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
  }), [])

  return (
    <div style={{ height: 'var(--chart-h)', minHeight: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 10, right: 16, left: 80, bottom: 8 }}
          onClick={(e) => {
            if (onSelectDevice && e && e.activePayload && e.activePayload[0]) {
              const d = e.activePayload[0].payload
              onSelectDevice(d.id, 'P')
            }
          }}
        >
          <CartesianGrid stroke={GRID} />
          <XAxis
            type="number"
            stroke={AXIS}
            tickLine={false}
            tickFormatter={(v) => toDisplay('P', v).toFixed(1)}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={AXIS}
            tickLine={false}
            width={120}
          />
          <Tooltip
            formatter={(v) => [toDisplay('P', v).toFixed(1), unit]}
            contentStyle={tooltipStyle}
            cursor={{ fill: 'rgba(2,6,23,0.04)' }}
          />
          <Bar
            dataKey={(r) => toDisplay('P', r.value)}
            fill={BAR}
            radius={[8, 8, 8, 8]}
            barSize={18}
          >
            <LabelList
              dataKey={(r) => toDisplay('P', r.value).toFixed(1)}
              position="right"
              style={{ fill: '#0f172a', fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {(!rows || rows.length === 0) && <SkeletonBox height={220} />}
    </div>
  )
}
