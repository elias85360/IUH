import { useEffect, useMemo, useState } from 'react'
import { useUiStore } from '../state/filters.js'
import { useAssets } from '../state/assets.js'
import { prefetchHome, prefetchDevices } from '../lib/prefetch.js'
import { api } from '../services/api.js'
import StatCards from '../components/StatCards.jsx'
import RoomContribution from '../components/RoomContribution.jsx'
import { Responsive, WidthProvider } from 'react-grid-layout'
import { Doughnut } from 'react-chartjs-2'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

const ResponsiveGridLayout = WidthProvider(Responsive)

const LAYOUT_KEY = 'home-layout-v3'

const BASE_ITEMS = [
  'devices-count',
  'load-progress',
  'temp-trend',
  'power-trend',
  'energy-trend',
  'room-contrib',
  'summary',
  'climate',
  'electrical',
]

function buildLayout(columns) {
  return BASE_ITEMS.map((key, index) => ({
    i: key,
    x: index % columns,
    y: Math.floor(index / columns) * 2,
    w: 1,
    h: 2,
  }))
}

const DEFAULT_LAYOUT = {
  lg: buildLayout(3),
  md: buildLayout(3),
  sm: buildLayout(2),
  xs: buildLayout(1),
  xxs: buildLayout(1),
}

const PERIOD_CHOICES = [
  { key: '30m', label: '30 min', ms: 30 * 60 * 1000, bucketMs: 2 * 60 * 1000 },
  { key: '1h', label: '1 h', ms: 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  { key: '24h', label: '24 h', ms: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
]

function readLayouts() {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(DEFAULT_LAYOUT))
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return normalizeLayouts(parsed)
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT))
}

function normalizeLayouts(layouts) {
  const clone = JSON.parse(JSON.stringify(DEFAULT_LAYOUT))
  for (const key of Object.keys(clone)) {
    if (Array.isArray(layouts[key])) {
      clone[key] = layouts[key]
    }
  }
  return clone
}

export default function HomePage({ devices }) {
  const { period, selectedRoom, selectedTags, setFilters, anchorNow } = useUiStore()
  const { meta } = useAssets()

  const [layouts, setLayouts] = useState(() => readLayouts())
  const [qualityItems, setQualityItems] = useState([])
  const [qualityLoading, setQualityLoading] = useState(true)

  // Filtered devices according to current room/tag selection
  const visibleDevices = useMemo(() => {
    if (!devices) return []
    let filtered = devices.filter((d) => {
      if (!selectedRoom || selectedRoom === 'all') return true
      const m = meta[d.id] || {}
      return (m.room || d.room) === selectedRoom
    })
    filtered = filtered.filter((d) => !(meta[d.id]?.exclude))
    if (selectedTags && selectedTags.length) {
      filtered = filtered.filter((d) => {
        const m = meta[d.id] || {}
        const tags = m.tags || d.tags || []
        return selectedTags.every((tag) => tags.includes(tag))
      })
    }
    if (!filtered.length) filtered = devices.filter((d) => !(meta[d.id]?.exclude))
    return filtered
  }, [devices, meta, selectedRoom, selectedTags])

  useEffect(() => {
    if (!devices || !devices.length) return
    try {
      prefetchHome(devices, { ms: period.ms })
      prefetchDevices(devices, { ms: period.ms })
    } catch {}
  }, [devices, period])

  useEffect(() => {
    let cancel = false
    async function fetchQuality() {
      setQualityLoading(true)
      try {
        const now = Date.now()
        const res = await api.quality({ from: now - 24 * 60 * 60 * 1000, to: now, bucketMs: 60 * 60 * 1000 })
        if (!cancel && res && Array.isArray(res.items)) setQualityItems(res.items)
        if (!cancel && (!res || !Array.isArray(res.items))) setQualityItems([])
      } catch {
        if (!cancel) setQualityItems([])
      }
      if (!cancel) setQualityLoading(false)
    }
    fetchQuality()
    return () => {
      cancel = true
    }
  }, [])

  function clearRoom() {
    setFilters({ selectedRoom: 'all' })
  }
  function clearTag(tag) {
    const next = (selectedTags || []).filter((t) => t !== tag)
    setFilters({ selectedTags: next })
  }

  const uptime = useMemo(() => {
    const arr = Array.isArray(qualityItems) ? qualityItems : []
    if (!arr.length) return { pct: 0, healthy: 0, total: 0 }
    const sumCompleteness = arr.reduce((acc, item) => acc + (Number(item.completeness) || 0), 0)
    const avg = sumCompleteness / arr.length
    const healthy = arr.filter((item) => (item.freshnessMs ?? Infinity) <= 60 * 60 * 1000).length
    return {
      pct: Math.round(Math.max(0, Math.min(100, avg * 100))),
      healthy,
      total: arr.length,
    }
  }, [qualityItems])

  const onLayoutChange = (_current, all) => {
    const normalized = normalizeLayouts(all)
    setLayouts(normalized)
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(normalized)) } catch {}
  }

  const healthyRatio = uptime.total ? uptime.healthy / uptime.total : 0

  const climateDevices = useMemo(() => visibleDevices.map((d) => ({ id: d.id, name: d.name })), [visibleDevices])

  return (
    <div className="home-wrapper">
      <div className="row" style={{ gap: 8, margin: '6px 0 18px' }}>
        {selectedRoom && selectedRoom !== 'all' && (
          <span className="badge">Room: {selectedRoom} <button className="btn" onClick={clearRoom}>✕</button></span>
        )}
        {(selectedTags || []).map((tag) => (
          <span key={tag} className="badge">Tag: {tag} <button className="btn" onClick={() => clearTag(tag)}>✕</button></span>
        ))}
      </div>

      <ResponsiveGridLayout
        className="home-grid"
        layouts={layouts}
        cols={{ lg: 3, md: 3, sm: 2, xs: 1, xxs: 1 }}
        rowHeight={220}
        margin={[16, 16]}
        compactType="vertical"
        isResizable={false}
        draggableHandle=".tile-head"
        onLayoutChange={onLayoutChange}
      >
        <div key="devices-count">
          <TileCard title="Devices" subtitle={selectedRoom && selectedRoom !== 'all' ? `Room: ${selectedRoom}` : 'All rooms'}>
            <DonutTileContent
              value={visibleDevices.length}
              total={devices.length}
              label="Devices"
              primaryColor="#2563eb"
            />
          </TileCard>
        </div>

        <div key="load-progress">
          <TileCard title="Data Freshness" subtitle="Devices reporting ≤ 60 min">
            <DonutTileContent
              value={Math.round(healthyRatio * 100)}
              total={100}
              label={`${uptime.healthy}/${uptime.total || '—'}`}
              format="percent"
              loading={qualityLoading}
              primaryColor="#16a34a"
            />
          </TileCard>
        </div>

        <div key="temp-trend">
          <MetricAreaTile
            title="Average Temperature"
            metricKey="temp"
            unit="°C"
            color="#34d399"
            bgClass="tile-sub green"
            devices={visibleDevices}
            anchorNow={anchorNow}
          />
        </div>

        <div key="power-trend">
          <MetricAreaTile
            title="Average Power"
            metricKey="P"
            unit="W"
            color="#facc15"
            bgClass="tile-sub amber"
            devices={visibleDevices}
            anchorNow={anchorNow}
          />
        </div>

        <div key="energy-trend">
          <MetricAreaTile
            title="Average Energy"
            metricKey="E"
            unit="Wh"
            color="#60a5fa"
            bgClass="tile-sub blue"
            devices={visibleDevices}
            anchorNow={anchorNow}
          />
        </div>

        <div key="room-contrib">
          <TileCard title="Room Contribution" subtitle="Active rooms">
            <div className="tile-sub neutral">
              <RoomContribution
                devices={visibleDevices}
                onSelectRoom={(room) => setFilters({ selectedRoom: room })}
              />
            </div>
          </TileCard>
        </div>

        <div key="summary">
          <SummaryTile
            devices={visibleDevices}
            anchorNow={anchorNow}
            bgClass="tile-sub violet"
          />
        </div>

        <div key="climate">
          <DualDonutTile
            title="Climate Snapshot"
            subtitle="Average temperature & humidity"
            metrics={[{ key: 'temp', label: 'Temp', color: '#38bdf8', unit: '°C', max: 40 }, { key: 'humid', label: 'Humidity', color: '#0ea5e9', unit: '%', max: 100 }]}
            devices={climateDevices}
            anchorNow={anchorNow}
            periodMs={period.ms}
            bgClass="tile-sub cyan"
          />
        </div>

        <div key="electrical">
          <DualDonutTile
            title="Electrical Snapshot"
            subtitle="Average voltage & current"
            metrics={[{ key: 'U', label: 'Voltage', color: '#a855f7', unit: 'V', max: 260 }, { key: 'I', label: 'Current', color: '#6366f1', unit: 'A', max: 25 }]}
            devices={climateDevices}
            anchorNow={anchorNow}
            periodMs={period.ms}
            bgClass="tile-sub cyan"
          />
        </div>
      </ResponsiveGridLayout>
    </div>
  )
}

function TileCard({ title, subtitle, children }) {
  return (
    <div className="tile-card">
      <div className="tile-head">
        <div>
          <h3 className="tile-title">{title}</h3>
          {subtitle && <div className="tile-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="tile-body">{children}</div>
    </div>
  )
}

function DonutTileContent({ value, total, label, format = 'count', loading = false, primaryColor }) {
  const percentage = format === 'percent'
    ? Math.max(0, Math.min(100, Number(value) || 0))
    : total
    ? Math.max(0, Math.min(100, (Number(value) / Number(total)) * 100))
    : 0

  const data = useMemo(() => ({
    labels: ['value', 'rest'],
    datasets: [
      {
        data: [percentage, 100 - percentage],
        backgroundColor: [primaryColor || '#2563eb', '#e5e7eb'],
        borderWidth: 0,
        cutout: '70%',
      },
    ],
  }), [percentage, primaryColor])

  return (
    <div className="tile-donut">
      <Doughnut data={data} options={{ plugins: { legend: { display: false } }, animation: false, maintainAspectRatio: false }} />
      <div className="tile-donut-value">
        <div className="value">{loading ? '--' : format === 'percent' ? `${Math.round(percentage)}%` : Number(value) || 0}</div>
        <div className="label">{loading ? 'Loading' : label}</div>
      </div>
    </div>
  )
}

function MetricAreaTile({ title, metricKey, unit, color, bgClass, devices, anchorNow }) {
  const [periodKey, setPeriodKey] = useState('1h')
  const periodPreset = PERIOD_CHOICES.find((p) => p.key === periodKey) || PERIOD_CHOICES[1]
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancel = false
    async function run() {
      if (!devices || !devices.length) {
        setSeries([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const data = await fetchAggregatedSeries({
          devices,
          metricKey,
          from: anchorNow - periodPreset.ms,
          to: anchorNow,
          bucketMs: periodPreset.bucketMs,
        })
        if (!cancel) setSeries(data)
      } catch {
        if (!cancel) setSeries([])
      }
      if (!cancel) setLoading(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [devices, metricKey, periodPreset, anchorNow])

  const values = series.map((p) => p.value).filter((v) => Number.isFinite(v))
  const avg = values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0

  return (
    <TileCard
      title={title}
      subtitle={devices && devices.length ? `${devices.length} device${devices.length > 1 ? 's' : ''}` : 'No device'}
    >
      <div className={bgClass}>
        <div className="tile-filter-row">
          <label htmlFor={`${metricKey}-period`} className="sr-only">Période</label>
          <select
            id={`${metricKey}-period`}
            className="ghost-input"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          >
            {PERIOD_CHOICES.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <div className="tile-metric">{loading ? '--' : avg.toFixed(1)} {unit}</div>
        </div>
        <div className="tile-chart">
          {series.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickFormatter={(value) => formatTick(value)}
                  stroke="rgba(255,255,255,0.6)"
                  minTickGap={32}
                />
                <YAxis stroke="rgba(255,255,255,0.6)" width={40} tickFormatter={(v) => `${Math.round(v)}`} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, '']}
                  labelFormatter={(label) => formatTooltipLabel(label)}
                  contentStyle={{ background: '#0f172a', color: '#f8fafc', borderRadius: 8, border: 'none' }}
                  cursor={{ stroke: 'rgba(255,255,255,0.25)' }}
                />
                <Area type="monotone" dataKey="value" stroke={color} fill={`url(#grad-${metricKey})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="tile-empty">{loading ? 'Chargement…' : 'Aucune donnée'}</div>
          )}
        </div>
      </div>
    </TileCard>
  )
}

function SummaryTile({ devices, anchorNow, bgClass }) {
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancel = false
    async function run() {
      if (!devices || !devices.length) {
        setSeries([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const data = await fetchAggregatedSeries({
          devices,
          metricKey: 'P',
          from: anchorNow - 60 * 60 * 1000,
          to: anchorNow,
          bucketMs: 5 * 60 * 1000,
        })
        if (!cancel) setSeries(data)
      } catch {
        if (!cancel) setSeries([])
      }
      if (!cancel) setLoading(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [devices, anchorNow])

  return (
    <TileCard title="Summary" subtitle={`${devices.length} device${devices.length > 1 ? 's' : ''}`}>
      <div className={bgClass}>
        <div className="tile-chart summary-chart">
          {series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-summary" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.12)" vertical={false} />
                <XAxis dataKey="name" tickFormatter={(value) => formatTick(value)} stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)} W`, '']}
                  labelFormatter={(label) => formatTooltipLabel(label)}
                  contentStyle={{ background: '#0f172a', color: '#f8fafc', borderRadius: 8, border: 'none' }}
                  cursor={{ stroke: 'rgba(255,255,255,0.25)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#a855f7" fill="url(#grad-summary)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="tile-empty">{loading ? 'Chargement…' : 'Aucune donnée'}</div>
          )}
        </div>
        <div className="tile-summary-cards">
          <StatCards devices={devices} />
        </div>
      </div>
    </TileCard>
  )
}

function DualDonutTile({ title, subtitle, metrics, devices, anchorNow, periodMs, bgClass }) {
  const [selectedDevice, setSelectedDevice] = useState(() => (devices && devices[0] ? devices[0].id : ''))
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!devices || !devices.length) {
      setValues({})
      setSelectedDevice('')
    } else if (!devices.find((d) => d.id === selectedDevice)) {
      setSelectedDevice(devices[0].id)
    }
  }, [devices, selectedDevice])

  useEffect(() => {
    let cancel = false
    async function run() {
      if (!selectedDevice) {
        setValues({})
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const result = {}
        await Promise.all(
          metrics.map(async (m) => {
            const avg = await fetchDeviceAverage({ deviceId: selectedDevice, metricKey: m.key, from: anchorNow - periodMs, to: anchorNow })
            result[m.key] = avg
          })
        )
        if (!cancel) setValues(result)
      } catch {
        if (!cancel) setValues({})
      }
      if (!cancel) setLoading(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [selectedDevice, metrics, anchorNow, periodMs])

  return (
    <TileCard title={title} subtitle={subtitle}>
      <div className={bgClass}>
        <div className="tile-filter-row">
          <label className="sr-only" htmlFor={`${title}-device`}>Device</label>
          <select
            id={`${title}-device`}
            className="ghost-input"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="dual-donut-wrapper">
          {metrics.map((metric) => {
            const val = values[metric.key]
            const numeric = Number(val)
            const percent = Number.isFinite(numeric) && metric.max
              ? Math.max(0, Math.min(100, (numeric / metric.max) * 100))
              : 0
            const data = {
              labels: ['value', 'rest'],
              datasets: [
                {
                  data: [percent, 100 - percent],
                  backgroundColor: [metric.color, 'rgba(255,255,255,0.2)'],
                  borderWidth: 0,
                  cutout: '70%',
                },
              ],
            }
            return (
              <div key={metric.key} className="tile-donut">
                <Doughnut data={data} options={{ plugins: { legend: { display: false } }, animation: false, maintainAspectRatio: false }} />
                <div className="tile-donut-value">
                  <div className="value">{loading || !Number.isFinite(numeric) ? '--' : numeric.toFixed(1)}</div>
                  <div className="label">{metric.label} ({metric.unit})</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </TileCard>
  )
}

function formatTick(value) {
  try {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    }
  } catch {}
  return value
}

function formatTooltipLabel(value) {
  try {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleString()
    }
  } catch {}
  return value
}

async function fetchAggregatedSeries({ devices, metricKey, from, to, bucketMs }) {
  if (!devices || !devices.length) return []
  const results = await Promise.all(
    devices.map(async (d) => {
      try {
        return await api.timeseries(d.id, metricKey, { from, to, bucketMs })
      } catch {
        return { points: [] }
      }
    })
  )
  const buckets = new Map()
  for (const res of results) {
    for (const p of res.points || []) {
      const ts = Number(p.ts)
      if (!Number.isFinite(ts)) continue
      const value = Number(p.value ?? p.avg ?? p.sum ?? 0)
      const key = Math.round(ts)
      const entry = buckets.get(key) || { ts: key, sum: 0, count: 0 }
      entry.sum += value
      entry.count += 1
      buckets.set(key, entry)
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.ts - b.ts)
    .map((entry) => ({
      name: entry.ts,
      value: entry.count ? entry.sum / entry.count : 0,
    }))
}

async function fetchDeviceAverage({ deviceId, metricKey, from, to }) {
  try {
    const bucketMs = Math.max(60 * 1000, Math.floor((to - from) / 60))
    const res = await api.timeseries(deviceId, metricKey, { from, to, bucketMs })
    const points = res.points || []
    const values = points.map((p) => Number(p.value ?? p.avg ?? p.sum ?? 0)).filter((v) => Number.isFinite(v))
    if (!values.length) return 0
    const sum = values.reduce((acc, v) => acc + v, 0)
    return sum / values.length
  } catch {
    return 0
  }
}
