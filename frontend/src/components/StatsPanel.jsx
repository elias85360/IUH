import { useMemo } from 'react'
// Import robust median helper.  The statsRobust module lives in
// the same directory as this file, so we use a relative import.
import { median } from '../lib/statsRobust.js'

// Compute quantile for a numeric array.  Returns NaN for empty arrays.
function quantile(values, q) {
  const arr = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!arr.length) return NaN
  const idx = (arr.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return arr[lo]
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo)
}
 
// Compute basic descriptive statistics from a series of points.  The
// series is an array of objects with a `value` property.  The
// returned object contains count, min, max, mean, median, variance,
// standard deviation and quartiles.  Non‑numeric values are ignored.
function describe(points) {
  const values = points.map((p) => Number(p.value)).filter((v) => Number.isFinite(v))
  const n = values.length
  if (n === 0) {
    return {
      count: 0,
      min: NaN,
      max: NaN,
      mean: NaN,
      median: NaN,
      variance: NaN,
      stddev: NaN,
      q25: NaN,
      q75: NaN,
    }
  }
  let min = values[0]
  let max = values[0]
  let sum = 0
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const mean = sum / n
  let varSum = 0
  for (const v of values) {
    const d = v - mean
    varSum += d * d
  }
  const variance = varSum / n
  const stddev = Math.sqrt(variance)
  const med = median(values)
  const q25 = quantile(values, 0.25)
  const q75 = quantile(values, 0.75)
  return { count: n, min, max, mean, median: med, variance, stddev, q25, q75 }
}

/**
 * Display a statistics panel for a given series.  The panel shows
 * basic descriptive statistics such as count, min, max, mean,
 * median, variance, standard deviation and quartiles.  It is
 * intended to complement the main visualisations by giving a quick
 * summary of the distribution of values.  When no data is
 * available, a placeholder is rendered.
 *
 * @param {Object} props
 * @param {Array} props.series Array of points (objects with ts and value)
 * @param {string} props.metric Metric key for labelling
 */
export default function StatsPanel({ series = [], metric = '' }) {
  const stats = useMemo(() => describe(series), [series])
  if (!stats.count) {
    return (
      <div className="panel">
        <div className="panel-title">Statistiques ({metric})</div>
        <div className="badge">Aucune donnée</div>
      </div>
    )
  }
  const num = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—')
  return (
    <div className="panel">
      <div className="panel-title">Statistiques ({metric})</div>
      <div className="kpi" style={{ flexWrap: 'wrap' }}>
        <div className="item">count: <strong>{stats.count}</strong></div>
        <div className="item">min: <strong>{num(stats.min)}</strong></div>
        <div className="item">max: <strong>{num(stats.max)}</strong></div>
        <div className="item">mean: <strong>{num(stats.mean)}</strong></div>
        <div className="item">median: <strong>{num(stats.median)}</strong></div>
        <div className="item">stddev: <strong>{num(stats.stddev)}</strong></div>
        <div className="item">Q1: <strong>{num(stats.q25)}</strong></div>
        <div className="item">Q3: <strong>{num(stats.q75)}</strong></div>
      </div>
    </div>
  )
}