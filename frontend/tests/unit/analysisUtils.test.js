import { describe, it, expect } from 'vitest'
import { computeDerivative, linearForecast } from '../../src/lib/analysisUtils.js'

describe('analysis utils', () => {
  it('computeDerivative returns same length', () => {
    const s = [{ ts: 0, value: 0 }, { ts: 1000, value: 10 }, { ts: 2000, value: 20 }]
    const d = computeDerivative(s)
    expect(d.length).toBe(3)
  })

  it('linearForecast projects forward', () => {
    const s = [{ ts: 0, value: 0 }, { ts: 1000, value: 10 }]
    const forecast = linearForecast(s, 2000, 1000)
    expect(forecast.length).toBeGreaterThan(0)
  })
})

 