// Simple robust statistics helpers (median, MAD, robust z-score)

export function median(arr) {
  const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y)
  if (!a.length) return NaN
  const m = Math.floor(a.length/2)
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2
}

export function mad(arr, med) {
  const d = arr.filter(Number.isFinite).map(v=>Math.abs(v - med))
  return median(d)
}

export function robustZ(values) {
  const v = values.filter(Number.isFinite)
  const med = median(v)
  const m = mad(v, med) || 1e-9
  const scale = 1.4826 * m
  return values.map(x => ({ value: x, z: (x - med)/scale }))
} 

// Baseline by weekday (0-6) x hour (0-23) using median
export function baselineByDOWHour(points) {
  // points: [{ ts, value }]
  const grid = Array.from({length:7},()=>Array.from({length:24},()=>[]))
  for (const p of points) {
    const d = new Date(p.ts)
    const dow = d.getDay() // 0..6
    const hour = d.getHours()
    const v = Number(p.value)
    if (Number.isFinite(v)) grid[dow][hour].push(v)
  }
  const baseline = grid.map(row => row.map(col => median(col)))
  return baseline // number[7][24]
}

export function valueMinusBaseline(points, baseline) {
  return points.map(p => {
    const d = new Date(p.ts)
    const v = Number(p.value)
    const b = baseline[d.getDay()][d.getHours()]
    return { ts: p.ts, value: v, baseline: b, delta: Number.isFinite(b)? (v - b) : 0 }
  })
}

