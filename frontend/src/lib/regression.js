// Simple least squares linear regression y = a + b x
export function linearRegression(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return { a: 0, b: 0 }
  let sx=0, sy=0, sxx=0, sxy=0
  for (let i=0;i<n;i++) {
    const x = Number(xs[i]); const y = Number(ys[i])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    sx += x; sy += y; sxx += x*x; sxy += x*y
  }
  const denom = (n*sxx - sx*sx) || 1e-9
  const b = (n*sxy - sx*sy) / denom
  const a = (sy - b*sx) / n
  return { a, b }
}
 
