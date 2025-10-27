// Utility functions for advanced analysis of IoT timeseries.
//
// This module provides helpers to compute the derivative of a series
// (rate of change), detect anomalies based on changes in the data,
// and perform simple forecasts.  These functions are intentionally
// lightweight so that they can run in the browser without blocking
// the main thread.  Heavy computations should be moved to a
// WebWorker or backend when dealing with large datasets.
 
/**
 * Compute the numerical derivative of a timeseries.  The input
 * series is an array of points with `ts` (timestamp in ms) and
 * `value` properties.  The returned array has the same length and
 * contains the derivative (dv/dt) at each point.  The first point
 * uses a forward difference while subsequent points use central
 * differences.  Units depend on the original series and the time
 * difference; for example, if the values are watts and timestamps
 * are in milliseconds, the derivative will be watts per millisecond.
 *
 * @param {Array<{ts:number,value:number}>} series
 * @returns {Array<{ts:number,value:number,derivative:number}>}
 */
export function computeDerivative(series) {
  if (!Array.isArray(series) || series.length < 2) return series.map(p => ({ ...p, derivative: 0 }))
  const out = []
  for (let i = 0; i < series.length; i++) {
    const { ts, value } = series[i]
    let deriv = 0
    if (i === 0) {
      // forward difference
      const dt = series[i + 1].ts - ts
      const dv = series[i + 1].value - value
      deriv = dt !== 0 ? dv / dt : 0
    } else if (i === series.length - 1) {
      // backward difference
      const dt = ts - series[i - 1].ts
      const dv = value - series[i - 1].value
      deriv = dt !== 0 ? dv / dt : 0
    } else {
      // central difference
      const dt = series[i + 1].ts - series[i - 1].ts
      const dv = series[i + 1].value - series[i - 1].value
      deriv = dt !== 0 ? dv / dt : 0
    }
    out.push({ ts, value, derivative: deriv })
  }
  return out
}

/**
 * Detect simple anomalies in a series using a z‑score threshold on the
 * derivative.  Points where the absolute z‑score of the derivative
 * exceeds the provided threshold are returned as anomalies.  The
 * function returns an array of anomalies with timestamp, value,
 * derivative and z‑score.  This is a naive approach that can
 * highlight sudden changes in the signal.
 *
 * @param {Array<{ts:number,value:number}>} series
 * @param {number} threshold z‑score threshold (e.g. 3)
 * @returns {Array<{ts:number,value:number,derivative:number,z:number}>}
 */
export function detectDerivativeAnomalies(series, threshold = 3) {
  const d = computeDerivative(series)
  // Extract derivative values
  const derivs = d.map(p => p.derivative)
  const n = derivs.length
  if (n === 0) return []
  const mean = derivs.reduce((s, v) => s + v, 0) / n
  const variance = derivs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n
  const std = Math.sqrt(variance) || 1e-12
  const anomalies = []
  for (let i = 0; i < n; i++) {
    const z = (derivs[i] - mean) / std
    if (Math.abs(z) >= threshold) {
      anomalies.push({ ts: d[i].ts, value: d[i].value, derivative: d[i].derivative, z })
    }
  }
  return anomalies
}

/**
 * Compute a simple forecast of the future values of a series using
 * linear extrapolation based on the last two points.  If fewer
 * points are available, the existing series is returned.  The
 * forecast spans the given horizon (milliseconds) and returns an
 * array of forecast points at regular intervals (default dt is the
 * interval between the last two points or 1 minute if not
 * available).
 *
 * @param {Array<{ts:number,value:number}>} series
 * @param {number} horizon Duration into the future in milliseconds
 * @param {number} [step] Optional override for step between forecast points
 */
export function linearForecast(series, horizon, step) {
  if (!Array.isArray(series) || series.length < 2) return []
  const n = series.length
  const p1 = series[n - 2]
  const p2 = series[n - 1]
  const dt = p2.ts - p1.ts
  const dv = p2.value - p1.value
  const rate = dt !== 0 ? dv / dt : 0
  const interval = step || dt || 60 * 1000
  const out = []
  const endTs = p2.ts + horizon
  for (let t = p2.ts + interval; t <= endTs; t += interval) {
    const v = p2.value + rate * (t - p2.ts)
    out.push({ ts: t, value: v })
  }
  return out
}