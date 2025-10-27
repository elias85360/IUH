import { describe, it, expect } from 'vitest'
import { computeStats, toCsv } from '../../src/lib/stats.js'

describe('stats helpers', () => {
  it('computeStats basic', () => {
    const pts = [{ ts: 1, value: 1 }, { ts: 2, value: 3 }]
    const s = computeStats(pts)
    expect(s.min).toBe(1)
    expect(s.max).toBe(3)
    expect(s.avg).toBe(2)
    expect(s.last).toBe(3)
  })

  it('toCsv shape', () => {
    const pts = [{ ts: 1, value: 1 }]
    const csv = toCsv(pts)
    expect(csv.split('\n').length).toBe(2)
  })
}) 

