// Utilities to improve axis precision and readability

export function domainTight(paddingRatio = 0.08, minSpan = 0.1) {
  return [
    (dataMin, dataMax) => {
      const span = Math.max(minSpan, Math.abs(dataMax - dataMin))
      const pad = span * paddingRatio
      const min = Number.isFinite(dataMin) ? dataMin - pad : 0
      return min
    }, 
    (dataMin, dataMax) => {
      const span = Math.max(minSpan, Math.abs(dataMax - dataMin))
      const pad = span * paddingRatio
      const max = Number.isFinite(dataMax) ? dataMax + pad : 1
      return max
    },
  ]
}

export function tickFormatterByRange(rangeApprox) {
  const abs = Math.abs(rangeApprox || 0)
  if (abs < 0.01) return (v) => v.toFixed(4)
  if (abs < 0.1) return (v) => v.toFixed(3)
  if (abs < 1) return (v) => v.toFixed(2)
  if (abs < 10) return (v) => v.toFixed(1)
  return (v) => String(Math.round(v))
}

